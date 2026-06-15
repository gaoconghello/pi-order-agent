console.log("Loading pi order agent...");

// 引入真实的 Pi 核心引擎和 AI 包
import { Agent } from "@earendil-works/pi-agent-core"; 
import { getModel } from "@earendil-works/pi-ai";
import { orderTool } from "./src/capabilities/tools/order-tool";
import { priceChangeTool } from "./src/capabilities/tools/price-change-tool";
import { queryTool } from "./src/capabilities/tools/query-tool";
import { returnTool } from "./src/capabilities/tools/return-tool";
import { transferTool } from "./src/capabilities/tools/transfer-tool";
import { buildSystemPrompt } from "./src/context/prompt-builder";


async function main() {
  console.log("Entering main function...");
  const groupId = "group_101";

  // 1. 读取完整的业务 Context
  const systemPrompt = await buildSystemPrompt(groupId);
  console.log("System prompt fetched successfully");
  
  // 4. Gateway: 模拟读取到的一段微信群聊天记录
  // 注意：需要符合 AgentMessage 格式，此处模拟多次发言，覆盖下单、退货、查询意图
  const rawMessages: any[] = [
    { role: "user", content: "李四: 老板，给我发10件货。", timestamp: Date.now() },
    { role: "user", content: "李四: 哎等一下，改成12件吧。", timestamp: Date.now() + 1000 },
    { role: "user", content: "张三: 老板，昨天送来的那批货质量不行，退货3件啊。", timestamp: Date.now() + 2000 },
    { role: "user", content: "王五: 帮我查下我们这个群今天订了些什么？", timestamp: Date.now() + 3000 }
  ];

  // 2 & 3. 组装真实的 Pi Agent 实例 (使用最新的 API 规范)
  const agent = new Agent({
    initialState: {
      systemPrompt: systemPrompt,
      model: {
        id: process.env.OPENAI_MODEL || "deepseek-chat",
        name: "DeepSeek Chat",
        api: "openai-completions",
        provider: "deepseek",
        baseUrl: process.env.OPENAI_BASE_URL || "https://api.deepseek.com/v1",
        reasoning: false,
        input: ['text'],
        contextWindow: 128000,
        maxTokens: 32000,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      } as any,
      tools: [orderTool, priceChangeTool, queryTool, returnTool, transferTool] as any,
      messages: rawMessages,
      thinkingLevel: "off",
    }
  });

  // 5. 启动 Pi 的引擎！
  console.log("🚀 启动 Pi 引擎处理订单...");
  
  // 使用 continue() 从当前的历史记录直接开始推理
  await agent.continue();

  // 获取所有的模型输出和调用记录
  console.log("🏁 完整的 Agent 对话记录：");
  console.log(JSON.stringify(agent.state.messages, null, 2));
}

main().catch(err => console.error("FATAL ERROR:", err));
