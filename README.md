# Pi Order Agent (批发业务订单智能处理系统 - Pi 引擎版)

Pi Order Agent 是一个基于 **TypeScript + Bun** 构建的智能 AI 代理系统。与传统的从零手写核心轮询逻辑不同，本项目底层直接接入了强大的 **Pi Agent 框架**，极大地精简了核心调度代码。它的核心目标是读取并分析微信群组聊天记录，使用大模型自动提取和转化出清晰的业务数据（如：**下单、转账、退货、价格变更、订单查询**等），并将其无缝存入本地 SQLite 数据库中。

## 🌟 核心特性

- **🚀 极速运行时**：基于 [Bun](https://bun.sh/) 原生运行，零编译负担，原生支持 `.env` 与 TypeScript。
- **🧠 引擎代工**：无需再手写 Agent 调度循环。直接利用 `@pi/agent-core` 处理死循环防御、函数调用格式解析、历史记录截断等底层脏活累活。
- **📦 本地化强类型数据库**：使用 Bun 内置的高性能 `bun:sqlite`，结合 TypeScript 领域轻量级 ORM 框架 [Drizzle ORM](https://orm.drizzle.team/)。
- **🧩 标准化业务工具**：直接暴露标准的 Object 对象（含 schema 和 execute）传递给引擎，取代了臃肿的 `ToolRegistry` 单例注册模式，实现真正的即插即用。
- **📝 上下文分离策略**：使用独立 Markdown 文件分离“角色设定”、“行业常识”和“各微信群独立画像”，利用大模型长文本及 KV Cache，降低提示词维护成本。

## 📁 目录结构

```text
pi-order-agent/
├── index.ts                # 项目启动主入口与 Gateway，实例化 Pi Agent 引擎
├── .env                    # API 密钥配置 (需从 .env.example 复制)
├── drizzle.config.ts       # Drizzle ORM 配置文件
├── src/
│   ├── capabilities/       # 💼 业务能力与工具层 (直接注入给 Pi Agent)
│   │   ├── store/          # 数据库 schema 与连接配置
│   │   └── tools/          # 下单、退货、转账等具体动作封装 (纯函数对象)
│   │
│   └── context/            # 📝 Prompt 资产管理层
│       ├── prompt-builder.ts # Prompt 组装器
│       ├── business.md     # 行业共性知识库
│       ├── role.md         # AI 角色设定
│       └── groups/         # 独立群组画像/特殊约定记忆
└── drizzle/                # 数据库自动生成的迁移文件存放处
```

## ⚙️ 环境配置与安装

1. **安装依赖**
   ```bash
   bun install
   ```

2. **配置环境变量**
   在根目录下将 `.env.example` 复制为 `.env`，并填入你的配置信息：
   ```bash
   cp .env.example .env
   ```
   *注意与密钥自动匹配规则：*
   * **OpenAI 兼容模式（目前默认）**：在 [index.ts](file:///D:/Project/pi-order-agent/index.ts) 中声明 `provider` 为 `"openai"` 时，底层的 AI 适配器会自动寻找环境变量 `OPENAI_API_KEY`。
   * **原生 DeepSeek 模式**：如果在 [index.ts](file:///D:/Project/pi-order-agent/index.ts) 中将 `provider` 切换为 `"deepseek"`，底层的 AI 适配器会自动寻找环境变量 `DEEPSEEK_API_KEY`（此模式下无需手动指定 `baseUrl`）。

3. **初始化数据库**
   推送 Drizzle Schema 到本地 SQLite 数据库文件（会自动在根目录生成 db 文件）：
   ```bash
   bunx drizzle-kit push
   ```

## 🚀 启动项目

```bash
bun run index.ts
```

启动后，系统将加载完整的业务上下文，读取 `index.ts` 中模拟的微信群消息，调用底层的 Pi Agent 引擎进行意图推理，并将工具执行的结果安全可靠地写入 `wholesale_business.sqlite` 数据库中。

## 🛠️ 扩展指南

**如果你想让 Agent 支持一种新指令（比如：“开具发票”）**：
1. 在 `src/capabilities/tools/` 目录下新建 `invoice-tool.ts`。
2. 按照其他 Tool 的规范，编写并导出一个包含 `name`, `description`, `parameters` 和 `execute` 函数的常量对象（例如 `export const invoiceTool = { ... }`）。
3. 在入口文件 `index.ts` 导入该工具，并在实例化 `Agent` 时将其塞入 `tools` 数组参数中即可完成全自动扩展！
