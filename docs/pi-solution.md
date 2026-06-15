理解了！你的思路非常清晰——既然 **Pi Agent** 本身已经把“引擎（Core）”做得足够好，完全没必要自己再手写一遍 `agent.ts` 和 `while` 循环。

你想做的是：**把真实的 Pi 作为底层引擎（依赖），然后用 Bun 来编写你的“网关（Gateway）”和“业务能力（Capabilities）”**。

下面是直接引入 Pi 真实生态系统，并结合 Bun 的高性能特性的具体实战指导。

---

### 1. 架构定位：如何组装 Pi 和 Bun？

在这个方案中，你的项目结构会变成真正的“外挂式”：

* **Core (引擎)**: 你的代码里**不再有**核心循环。直接 `import { Agent } from 'pi-agent-core'`（或类似的核心包）。
* **Capabilities (能力)**: 利用 Bun 原生的 `bun:sqlite` 写数据存储，然后包装成 Pi 认可的 `Tool` 格式注册给它。
* **Gateway (入口)**: 写一个 Bun 脚本（`index.ts`），负责读取微信消息，并调用 Pi 的 API 启动跑批。

---

### 2. 项目初始化与依赖安装

用 Bun 创建项目并安装 Pi 的核心包。

```bash
mkdir pi-wholesale-agent
cd pi-wholesale-agent
bun init

# 安装 Pi 的核心模块 (以其实际发布的 npm 包名为准，通常分为 ai 层和 agent 层)
# 注意：如果你使用的是 earendil-works/pi，这里我们假定其核心库为 @pi/agent-core 
bun add @pi/agent-core @pi/ai 

# 安装你顺手的模型 SDK (Pi 底层需要，比如你要连 DeepSeek 或 Qwen)
bun add openai 

```

---

### 3. 核心代码实现路径

按照“只需注入业务”的理念，你需要写以下几个核心文件：

#### 第 1 步：利用 Bun 开发极速存储 Tool (Capabilities 层)

Pi 允许你传入自定义的工具。我们用 `bun:sqlite` 写一个极快且无需编译 C++ 依赖的订单记录工具。

创建文件：`src/tools/record-order.ts`

```typescript
import { Database } from "bun:sqlite";

// 初始化本地数据库
const db = new Database("wholesale.sqlite", { create: true });
db.run(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id TEXT,
    buyer TEXT,
    quantity INTEGER,
    confidence TEXT
  )
`);

// 按照 Pi 的标准 Tool 接口定义你的工具
export const recordOrderTool = {
  name: "record_order",
  description: "记录客户的批发订单。当明确数量时调用。",
  parameters: {
    type: "object",
    properties: {
      groupId: { type: "string" },
      buyer: { type: "string" },
      quantity: { type: "number" },
      confidence: { type: "string", enum: ["HIGH", "PENDING_REVIEW"] }
    },
    required: ["groupId", "buyer", "quantity", "confidence"]
  },
  // 当 Pi 决定调用该工具时，会执行这个函数
  execute: async (args: any) => {
    const query = db.prepare(`
      INSERT INTO orders (group_id, buyer, quantity, confidence) 
      VALUES (?, ?, ?, ?)
    `);
    query.run(args.groupId, args.buyer, args.quantity, args.confidence);
    
    // 返回给 Pi 的执行结果
    return JSON.stringify({ status: "success", message: "已写入本地 SQLite" });
  }
};

```

#### 第 2 步：注入业务知识 (Skills & Context 层)

把行业知识和群画像写成 Markdown 文本，稍后喂给 Pi 的系统提示词（System Prompt）。

创建文件：`src/context/business.md`

> 业务规则：默认规格为一箱（10件）。如果客户说“加3”，指的是总数+3。如果无法确定，务必调用工具并标记 PENDING_REVIEW。

#### 第 3 步：编写 Gateway 触发 Pi 引擎 (入口层)

这是你的主程序入口。它的工作就是把 JSON 里的订单消息拿出来，配置好 Pi 的引擎，然后“放狗”。

创建文件：`src/index.ts`

```typescript
// 引入 Pi 的核心引擎 (假定 API 结构)
import { Agent, Session } from "@pi/agent-core"; 
import { LLMProvider } from "@pi/ai";
import { recordOrderTool } from "./tools/record-order";

async function main() {
  const groupId = "group_101";

  // 1. 读取业务 Context (使用 Bun 原生极速读取)
  const businessContext = await Bun.file("src/context/business.md").text();
  
  // 2. 初始化大模型提供商 (例如接入你提到的 Qwen 或 DeepSeek)
  const llm = new LLMProvider({
    provider: "openai", // 使用 OpenAI 兼容接口
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: "https://api.deepseek.com/v1",
    model: "deepseek-chat"
  });

  // 3. 组装 Pi 的 Agent 实例，注入你的自定义 Tool 和 Context
  const agent = new Agent({
    llm: llm,
    tools: [recordOrderTool], // <-- 你的业务能力在这里注入
    systemPrompt: `你是一个批发生意订单处理助手。\n${businessContext}`
  });

  // 4. Gateway: 模拟读取到的一段微信群聊天记录
  const rawMessages = [
    { role: "user", content: "李四: 老板，给我发10件货。" },
    { role: "user", content: "李四: 哎等一下，改成12件吧。" }
  ];

  // 5. 启动 Pi 的引擎！
  console.log("🚀 启动 Pi 引擎处理订单...");
  
  // Pi 会在底层自动运行 while 循环：阅读消息 -> 思考 -> 调用你的 record_order 工具 -> 记录结果
  const session = new Session(rawMessages);
  const result = await agent.run(session);

  console.log("🏁 处理完毕，Pi 返回的最终总结:", result.finalMessage);
}

main();

```

---

### 4. 这种集成方式的最大优势

通过这种方式，你真正做到了“不造轮子”：

1. **Token 统计、大模型接口抹平、流式输出**：全都由 `@pi/ai` 帮你处理好了。
2. **死循环防御、Tool Calling 的兼容性修正**（你文章里提到的 Qwen/DeepSeek 的坑）：Pi 官方的 `agent-core` 内部已经帮你兜底了。
3. **极度轻量**：你用 Bun 跑这个 TypeScript 脚本，启动只要几毫秒，而且 `bun:sqlite` 让你的查表速度快到起飞。

由于你提到的附件中踩过了一些特定模型的坑（例如 Qwen 的死循环和 DeepSeek 的 Token 截断），目前你打算优先接入哪一种大模型来跑这个系统？需要我顺便提供一下在框架中避开这些特定模型坑的配置代码吗？