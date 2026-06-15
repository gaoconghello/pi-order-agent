#### 架构：三层

整个系统分三层：

**Gateway (入口) → Core/Harness (引擎) → Capabilities (业务)**

**Gateway** 是数据入口，现在读 JSON 文件，以后接微信机器人。它的作用是：把原始消息清洗成结构化的 Message 对象。

**Core** 是引擎，不知道自己在处理什么业务。它只做一件事：把消息给 LLM → LLM 说调 tool 就调 → 结果喂回去 → 循环。它不知道"订单"是什么，不知道"件数"是什么。搜遍 `core/` 目录，找不到任何业务词汇。这意味着：换一个行业（物流、餐饮、零售），`core/` 一行不改。

**Capabilities** 是业务层，放所有具体的东西——订单模型、数据库、5个 tool、群画像。加新功能 = 写新文件 + 注册，永远不改已有文件。

* **`core/`** <- 业务无关，通用引擎
* `agent.py`：while 循环：发消息→调tool→喂结果→继续
* `registry.py`：tool 注册表，bootstrap 自动扫描 tools/ 目录
* `session.py`：对话上下文管理
* `llm.py`：LLM 接口，抹平不同模型的行为差异
* `events.py`：事件总线
* `types.py`：Message, ToolCall 等基础类型
* `config.py`：配置开关


* **`capabilities/`** <- 业务层，可替换
* `domain/`：领域模型 (零外部依赖，只有 Python 标准库)
* `store/`：SQLite 数据库
* `tools/`：5 个 tool：下单、转账、退货、价格变动、查询
* `context/`：提示词：行业知识 + 角色设定
* `memory/`：若干个群的画像 + index.json 路由
* `extensions/`：扩展钩子 (消息分段、未来：审查、脱敏、审计)



---

### 扩展性设计

系统的扩展性不是靠复杂的插件框架，而是靠一致的注册模式。每种扩展方式都是同一个套路：写文件 + 注册。

#### 5 种扩展方式

**1. 加新 Tool — LLM 可调用的能力**
启动后 LLM 自动知道有这个 tool 可用。
Tool 的本质：Tool 是 LLM 可以主动调用的能力。LLM 读到消息后自己判断要不要调、调哪个、传什么参数。代码不做这个判断 —— 没有 if/elif 消息分类，没有正则匹配。这也是为什么不需要 Parser —— LLM 就是 parser。

**2. 加新群画像 — per-group 知识注入**
`capabilities/memory/groups/ 新客户群.md` <- 新画像
系统处理这个群的消息时，自动加载画像注入 prompt。
画像告诉 LLM 这个群的特殊规律 —— 谁说了算、门店叫什么、默认规格是什么。不同群的画像完全独立，互不影响。

**3. 加新 Extension — 数据管道中的变换环节**
`capabilities/extensions/sanitizer.py` <- 新文件
Extension 是数据管道中的变换环节。它改数据本身 —— 输入一种格式，输出另一种格式。数据必须经过它，它是处理链上的一环。
现在实现了 `session_grouper.py` (按天分段)，规划的 Extension：

| Extension | 输入 | 输出 | 作用 |
| --- | --- | --- | --- |
| session_grouper | Message 列表 | Segment 列表 | 按天分段，让 LLM 看到完整上下文 |
| sanitizer | Message | Message (脱敏后) | 金额等敏感信息替换为 *** |

Extension 的设计原则：纯函数，零 core 依赖。输入是什么、输出是什么，可以独立测试。不 import `core/` 的任何东西。

**4. 加新 Gateway — 换数据入口**
Gateway 只做一件事：把原始数据转成 Message 对象。它不碰 `core/`，不碰 LLM。在 `main.py` 里换成新 gateway，整个系统就走新数据源了。
这意味着：从 JSON 文件 → 微信实时消息 → 钉钉 → 飞书，只换 Gateway，其余不动。

**5. 换业务 — 换 capabilities/ 目录**
如果不用来处理批发订单了，改成处理餐饮外卖、物流调度、客服工单：

* `domain/models.py` — 换成新的领域模型
* `tools/` — 换成新的 tool
* `context/business.md` — 换成新的行业知识
* `memory/groups/` — 换成新的客户画像

#### 总结优势

特别好：

* **功能随加随用** — 想加新能力？写个 skill 文件，一行注册，零改动已有代码。
* **极度灵活** — 自定义 tool、自定义 prompt 片段、自定义快捷键，想怎么配怎么配。
* **harness 完全不知道自己在干嘛** — agent loop 就是个简单的 while 循环，发消息给 LLM、调 tool、喂结果。它不知道自己在写代码还是在处理订单，所有业务知识都是注入的。

这就是所谓的 "harness 是空壳，能力通过注册注入"。

朋友的订单系统正好需要这种灵活性 — 几百个群，每个群画像不同，随时可能加新类型的消息处理。如果写死在代码里，每加一个群就要改一次代码。但用 Pi 的理念：每个群一份画像文件，新群 = 新文件，代码不动。`core/` 8 个文件原封不动。

---

### 3 种集成方式（来自 Pi 的设计）

上面是横向扩展（加新能力）。还有 3 种纵向集成方式，用来让模块之间协作而不互相认识：

**7. Skill — 领域知识 + 操作流程的封装**
Skill 是 Pi 的核心扩展机制。一个 Skill 是一个完整的操作指南 — 什么时候触发、怎么做、注意什么。它不是代码，是一份结构化的 markdown。

```text
skills/
├── order-review/SKILL.md  <- "复核订单"技能
└── batch-import/SKILL.md  <- "批量导入"技能

```

Skill 文件里包含：

* **触发条件** — 用户说什么话时加载这个 skill
* **操作步骤** — 第一步做什么、第二步做什么
* **知识参考** — 相关的 business.md 片段、tool 用法
* **检查清单** — 做完后验证什么

比如"复核订单" skill 会告诉 LLM：先查今天所有待审查订单 → 逐条跟原始消息比对 → 确认或修正。这些流程如果写在 `role.md` 里会很长，按 skill 按需加载才合理。

> **Skill 和 Tool 的区别：** Tool 是一个原子操作（记录一笔订单），Skill 是一个多步骤流程（复核今天所有订单）。Tool 是代码，Skill 是 prompt。

**8. Context — 动态 prompt 片段**
Context 是在运行时动态注入的 prompt 内容。比如群画像是 per-group 的 context，每天的订单汇总可以作为当天的 context 注入。

```text
context/
├── business.md      <- 静态：行业知识（固定）
├── role.md          <- 静态：角色设定（固定）
└── [运行时注入]
    ├── 群画像        <- 动态：per-group 知识
    └── 今日汇总      <- 动态：per-session 数据

```

这种设计来自 Pi 的 promptSnippet 机制 — harness 控制 prompt 的拼接结构（什么放前面、什么放后面），tools/skills/memory 填充具体内容。每个模块只知道自己该贡献什么，不知道最终 prompt 长什么样。

**9. EventBus — 模块间松耦合通信**
模块之间不直接调用，而是通过事件总线间接通信。Tool A 记录了一笔订单后，发一个 `order_recorded` 事件。审查模块、审计模块、通知模块各自订阅这个事件，做自己的事。Tool A 不知道谁在监听，监听者也不知道谁发的。

> **Extension 和 EventBus 的区别：**
> Extension 改数据（消息分段、脱敏），是数据管道的一部分；EventBus 不改数据，是事后通知（"这件事发生了，谁关心谁处理"）。`review_guard` 表面看像 Extension（它要改订单状态），但本质是"收到 `order_recorded` 事件后执行一段逻辑"，属于 EventBus 订阅者，不是管道环节。

---

### 踩过的模型坑

**qwen3.6 的 tool calling 死循环**
同一段消息被处理 5 次，DB 里出现大量重复。去 LangSmith（LLM 可观测性平台）看 trace，发现 assistant message 同时带了分析文字和 `tool_calls`。下一轮 LLM 看到自己写了"需记录"，以为还没处理完，就又调一遍。
*修复一行：* 有 `tool_calls` 时丢弃 content。不同模型对同一 API 的行为不同 — 有些 `content=""` + tool_calls，有些同时返回。做 agent framework 必须在 harness 层统一。

**qwen3.6 的 thinking 模式**
默认开启，53% 的 token 花在内部推理上。简单 4 条消息从 9 秒变成 33 秒。加 `enable_thinking: False` 解决。通用规则：thinking 适合复杂推理，但 tool calling 场景不需要。

**deepseek 的 max_tokens 截断**
`max_tokens=2048` 太小，输出被截断，LangSmith 出现幽灵 trace。增大到 4096 解决。不同模型的 token 消耗差异大，宁大勿小。

---

### 持续质疑复杂度

每加一个抽象层之前问：真的需要吗？

* **Parser 基类？** → 不需要，LLM 直接理解
* **Tool 基类？** → 不需要，`register()` 函数就够了
* **状态机？** → 不需要，agent loop 是简单 while 循环
* **EventBus hook chain？** → 暂时不需要，只有 1 个消费者（YAGNI）
* **门店名映射表？** → 不需要，群画像里写清楚就行

### 知识分层

| 层 | 内容 | 放哪 | 谁写的 |
| --- | --- | --- | --- |
| **行业常识** | 规格表、交易流程 | business.md | 人写，很少变 |
| **群规律** | 角色关系、谁说了算 | 群画像 | 人分析数据后写 |
| **操作指引** | 什么时候该查历史 | tool description | 写 tool 时一起写 |
| **角色设定** | 你是谁 | role.md | 人写，很少变 |

每层各管各的，不交叉。群画像里不写 tool 名（tool 怎么用由 tool 自己告诉 LLM），tool description 里不写具体人名（避免硬编码），`business.md` 里不写某个群的行为（它是行业通用的）。

---

### Prompt 排列顺序的影响

现在系统给 LLM 的 prompt 按这个顺序排列：

1. `business.md` （行业常识，固定不变）
2. `role.md` （角色设定，固定不变）
3. **群画像** （per-group 知识，半固定）
4. **当天的消息** （每次不同，变化最大）

为什么这么排？两个原因。

**注意力 U 型分布。** 斯坦福和 Meta 的论文 "Lost in the Middle" 发现，LLM 对长文本的注意力呈 U 型分布 — 开头和结尾注意力最高，中间最低。关键信息放中间时，准确率下降 20% 以上。我们把不变的行业知识放最前面（先建立"这个行业的常识"），变动的消息放最后（LLM 最后读到、马上处理），中间放群画像（它才是理解上下文的关键知识）。

**KV Cache 复用。** 这是个工程优化。LLM 处理每轮对话时，要把所有历史 token 重新算一遍。但前面没变的部分，计算结果可以缓存复用。所以排列规则是：越不常变的放越前面。`business.md` 几乎永远不变，缓存利用率最高；消息每次都变，放最后。如果倒过来，消息放中间、群画像放最后，每次新消息进来，群画像的缓存就失效了，白白重算。

实际效果：固定前缀（`business.md` + `role.md` + 群画像）大约 2500 token，消息平均 500-2000 token。前缀不变时，每轮省掉约一半的计算量。

> **简单记：**不变的放前面，常变的放后面，最重要的放开头和结尾。

⚠️ 目前 agent loop 是单轮处理（一段消息一个 session，跑完就结束），所以 KV Cache 复用还没真正生效。等后续改成多轮交互式 gateway（LLM 和人来回对话），这个排列顺序的收益才会体现。

---

### Reviewer Skill — 用清单约束设计

每次写完一个阶段，跑一遍 10 条审查清单（节选）：

1. **解耦** — `grep "from capabilities" core/` 必须为空
2. **SSOT** — 每个概念只定义一次
3. **扩展性** — 加功能只加文件不改已有，bootstrap 自动扫描
4. **Harness 空壳** — `core/` 零业务字符串
5. **输入信任 LLM** — 输入侧不用 enum
6. **行业知识纯度** — `business.md` 换个行业内容仍成立