# TypeScript + Bun AI Agent 系统实现方案

基于 Pi Agent 的核心设计：**引擎层（Harness）仅提供运行框架，业务逻辑（Capabilities）通过注册机制注入**。使用 Bun 的原生 TypeScript 支持及其内置工具库（如 `bun:sqlite`）简化存储与对账系统的实现。

---

## 1. 使用 Bun 初始化项目

在终端执行以下命令，快速初始化一个原生的 TypeScript 项目：

```bash
mkdir order-agent
cd order-agent
bun init
```

`bun init` 生成 `tsconfig.json`、`package.json` 及 `index.ts`。

安装大模型调用所需的依赖。这里以 OpenAI API 为例（兼容 Qwen / DeepSeek 等模型的接口）：

```bash
bun add openai
```

---

## 2. 推荐的目录结构

采用三层架构布局：

```text
order-agent/
├── src/
│   ├── core/                  # 核心引擎层（禁止 import capabilities）
│   │   ├── agent.ts           # Agent 主循环
│   │   ├── registry.ts        # Tool 注册表
│   │   ├── llm.ts             # LLM 适配器
│   │   ├── event-bus.ts       # 事件总线
│   │   └── types.ts           # 基础类型 (Message, ToolCall)
│   │
│   ├── capabilities/          # 业务能力层
│   │   ├── domain/            # 领域模型 (纯 TS 逻辑)
│   │   ├── store/             # 数据库操作 (使用 bun:sqlite)
│   │   ├── tools/             # 具体业务工具 (下单、对账等)
│   │   ├── extensions/        # 数据流管道 (按天分段、脱敏)
│   │   └── skills/            # 顶层复杂流控指南 (Markdown)
│   │
│   ├── context/               # Prompt 资产
│   │   ├── business.md        # 行业常识
│   │   ├── role.md            # 角色设定
│   │   └── groups/            # 客户群画像 (Group Memories)
│   │
│   ├── gateway/               # 入口适配器
│   │   ├── json-gateway.ts    # 读取本地 JSON 历史消息
│   │   └── wechat-gateway.ts  # 未来扩展的微信接入
│   │
│   └── index.ts               # 项目启动入口 (Bootstrap)
├── tsconfig.json
└── package.json
```

---

## 3. 核心模块实现参考

### 3.1 `core/types.ts` — 核心类型定义

使用联合类型（Union Types）定义消息和工具：

```typescript
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string; // 当 role 为 tool 时，关联的调用 ID
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON 字符串
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: object; // JSON Schema
  execute: (args: any) => Promise<any>;
}
```

### 3.2 `core/registry.ts` — 零内聚工具注册表

通过 Map 实现工具注册，新增功能只需“写新文件 + 注册”即可。

```typescript
import { ToolDefinition } from './types';

export class ToolRegistry {
  private static tools = new Map<string, ToolDefinition>();

  public static register(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
    console.log(`[Registry] Tool 注册成功: ${tool.name}`);
  }

  public static getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  public static getAllDefinitions() {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }));
  }
}
```

### 3.3 `core/agent.ts` — 业务无关的 Agent Loop

当模型返回 `tool_calls` 时，即使 content 包含文本也须主动丢弃，防止模型在下一轮将自身输出误判为未执行的工具调用。

```typescript
import { Message, ToolCall } from './types';
import { ToolRegistry } from './registry';
import { callLLM } from './llm';

export async function runAgentLoop(sessionHistory: Message[]): Promise<Message[]> {
  let loopCount = 0;
  const maxLoops = 5; // 防止极端情况死循环

  while (loopCount < maxLoops) {
    loopCount++;
    
    // 1. 请求大模型
    const response = await callLLM(sessionHistory, ToolRegistry.getAllDefinitions());
    
    // 坑点修复：如果模型返回了 tool_calls，不管它有没有返回 content，都清空或不处理 content
    // 防止下一轮模型看到自己的分析，误以为自己没有执行工具
    if (response.tool_calls && response.tool_calls.length > 0) {
      response.content = ""; 
    }

    sessionHistory.push(response);

    // 2. 如果模型不需要调用工具，说明对话结束，直接退出
    if (!response.tool_calls || response.tool_calls.length === 0) {
      break;
    }

    // 3. 并行执行模型要求调用的工具
    for (const toolCall of response.tool_calls) {
      const tool = ToolRegistry.getTool(toolCall.function.name);
      let toolResult: any;

      if (!tool) {
        toolResult = { error: `Tool ${toolCall.function.name} 未找到` };
      } else {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          toolResult = await tool.execute(args);
          
          // 此处可以触发 EventBus.emit('order_recorded', toolResult) 用于解耦通知
        } catch (err: any) {
          toolResult = { error: `执行失败: ${err.message}` };
        }
      }

      // 4. 将工具执行结果追加到上下文
      sessionHistory.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(toolResult)
      });
    }
  }

  return sessionHistory;
}
```

---

## 4. 业务层利用 Bun 的特殊优化

### 4.1 本地存储与表结构迁移：`bun:sqlite` + Drizzle ORM

Bun 内置了 SQLite 库。结合 Drizzle ORM 管理表结构及迁移历史。

首先安装相关依赖：

```bash
bun add drizzle-orm
bun add -d drizzle-kit
```

在 `src/capabilities/store/schema.ts` 中定义核心业务表：

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// 订单与退货表
export const orders = sqliteTable('orders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  groupId: text('group_id').notNull(),
  buyer: text('buyer').notNull(),
  itemName: text('item_name').notNull(),
  quantity: integer('quantity').notNull(),
  price: integer('price'), // 可选价格
  type: text('type', { enum: ['ORDER', 'RETURN'] }).default('ORDER').notNull(),
  status: text('status', { enum: ['PENDING', 'CONFIRMED', 'CANCELLED'] }).default('PENDING').notNull(),
  confidence: text('confidence', { enum: ['HIGH', 'PENDING_REVIEW'] }).notNull(),
  rawMessage: text('raw_message').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// 转账记录表
export const transactions = sqliteTable('transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  groupId: text('group_id').notNull(),
  sender: text('sender').notNull(),
  amount: integer('amount').notNull(),
  status: text('status', { enum: ['UNVERIFIED', 'VERIFIED'] }).default('UNVERIFIED').notNull(),
  confidence: text('confidence', { enum: ['HIGH', 'PENDING_REVIEW'] }).notNull(),
  rawMessage: text('raw_message').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// 价格变动映射表
export const priceRules = sqliteTable('price_rules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  groupId: text('group_id').notNull(),
  itemName: text('item_name').notNull(),
  agreedPrice: integer('agreed_price').notNull(),
  effectiveDate: text('effective_date').default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});
```

然后在 `src/capabilities/store/db.ts` 中初始化 Drizzle 客户端：

```typescript
import { Database } from "bun:sqlite";
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from './schema';

// 初始化本地数据库文件
const sqlite = new Database("wholesale_business.sqlite", { create: true });
export const db = drizzle(sqlite, { schema });
```

如需自动生成迁移，在项目根目录创建 `drizzle.config.ts`：

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/capabilities/store/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: "wholesale_business.sqlite",
  }
});
```
运行 `bunx drizzle-kit generate` 和 `bunx drizzle-kit migrate` 实现 schema 追踪和增量迁移。

### 4.2 编写一个具体的 Tool 例子

在 `src/capabilities/tools/order-tool.ts` 中：

```typescript
import { ToolRegistry } from '../../core/registry';
import { db } from '../store/db';
import { orders } from '../store/schema';

ToolRegistry.register({
  name: 'record_order',
  description: '当群成员明确表达购买、下单、加单或修改订单意图时调用此工具。',
  parameters: {
    type: 'object',
    properties: {
      groupId: { type: 'string', description: '微信群唯一ID' },
      buyer: { type: 'string', description: '下单人的微信昵称' },
      itemName: { type: 'string', description: '商品名称或品类' },
      quantity: { type: 'number', description: '最终的数量变化，加单为正数，减单/改单为调整后的绝对数' },
      confidence: { type: 'string', enum: ['HIGH', 'PENDING_REVIEW'], description: '如果语义模糊或存在多人口径不一致，务必传 PENDING_REVIEW' },
      rawMessage: { type: 'string', description: '提取出该业务指令的原始用户聊天消息内容' }
    },
    required: ['groupId', 'buyer', 'itemName', 'quantity', 'confidence', 'rawMessage']
  },
  execute: async (args) => {
    // 使用 Drizzle ORM 的强类型 Insert
    await db.insert(orders).values({
      groupId: args.groupId,
      buyer: args.buyer,
      itemName: args.itemName,
      quantity: args.quantity,
      confidence: args.confidence,
      rawMessage: args.rawMessage,
      type: 'ORDER', // 默认类型
      status: 'PENDING'
    });
    
    return { status: 'success', message: '订单已成功写入待复核库' };
  }
});
```

---

## 5. Prompt 编排与 KV Cache

为最大化 **KV Cache 复用** 并遵循 **Lost in the Middle** 原理，按以下顺序组装 `system_prompt`：

```typescript
async function buildSystemPrompt(groupId: string): Promise<string> {
  const businessMd = await Bun.file("context/business.md").text(); // 永远不变
  const roleMd = await Bun.file("context/role.md").text();         // 永远不变
  
  // 尝试读取该群的特殊画像，如果没有则使用默认值
  let groupMemory = "";
  try {
    groupMemory = await Bun.file(`context/groups/${groupId}.md`).text(); // 半固定
  } catch {
    groupMemory = "该群无特殊策略，按行业常识处理。";
  }

  // 严格按照：最不变 -> 较不变 -> 变动 的顺序返回
  return `
${businessMd}

${roleMd}

### 当前群组上下文及画像历史
${groupMemory}
`;
}
```

---

## 6. 启动与运行

在 `src/index.ts` 中引入 Gateway 读入消息，并 import `tools/` 目录下的文件完成注册：

```typescript
// 1. 自动扫描并注册所有业务 Tools
import "./capabilities/tools/order-tool";
// import "./capabilities/tools/transfer-tool"; // 按需启用

import { buildSystemPrompt } from "./context/prompt-builder";
import { runAgentLoop } from "./core/agent";
import { Message } from "./core/types";

// 模拟从 Gateway 拿到的一段群聊消息
const mockGroupId = "wechat_group_001";
const rawMessagesFromGateway = [
  { role: "user", content: "张老板：今天还是老规矩，先拉20件大白菜过来。" },
  { role: "user", content: "张老板：等等，改成15件吧，今天降温销路不好。" }
];

async function main() {
  const systemPrompt = await buildSystemPrompt(mockGroupId);
  
  const sessionHistory: Message[] = [
    { role: "system", content: systemPrompt },
    ...rawMessagesFromGateway as any
  ];

  console.log("Agent 启动处理消息...");
  const finalState = await runAgentLoop(sessionHistory);
  console.log("处理完成，最终对话状态总轮数:", finalState.length);
}

main();
```

运行项目：

```bash
bun run src/index.ts
```


