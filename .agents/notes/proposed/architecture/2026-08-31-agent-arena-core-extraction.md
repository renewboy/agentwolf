# Agent Note: Agent Arena Core 跨游戏基础框架

Status: proposed

## Problem

AgentWolf 的确定性 Ruleset、长驻 ACP Session、隐藏信息投影、并行 barrier、轨迹与双 runner 仿真
分布在 contracts、game-engine、server、assets 与测试代码中，其中跨游戏职责与狼人杀领域职责共享
同一批类型和组合入口。独立基础框架需要明确两类职责的所有权，并提供可由多个游戏模块实现的稳定
契约。

未来游戏需要覆盖不同的决策模型。Avalon 需要隐藏身份、组队、投票与任务 barrier；卡牌对战需要
连续行动、资源区与嵌套响应窗口；团队文字游戏需要团队私有事实、公开提示和并行猜测。基础框架必须
复用现有经过验证的机制，同时让每个游戏拥有自己的 state、action、event、projection 与 Prompt
语义。

## Proposal

建立独立仓库 `agent-arena-core`，package scope 使用 `@agent-arena/*`。开发阶段由 AgentWolf 在
`vendor/agent-arena-core` 以 Git submodule 固定 Core commit；Core 变更先在独立仓提交，AgentWolf
只更新适配代码与 submodule pointer。稳定发布方式在跨仓契约经过实际消费者验证后另行决定。

Ruleset 是 Core 的首要扩展机制。Core 提供泛型 `RulePlugin<Registrar>`、依赖与配置校验、安装
作用域、semantic ownership、Ruleset revision/lock/fingerprint、通用 phase graph 与有界 resolution
agenda。游戏 family 提供自己的 Registrar、registries 与编译结果：AgentWolf 注册 Role、Ability、
Phase、Effect、Trigger 与 Victory；其他游戏可以注册任务、卡牌、武将、响应窗口、关键词或计分规则。

Core Match runtime 只消费游戏提供的 `GameModule`。`GameModule` 由编译后的 Ruleset runtime 实现，
拥有 setup/state/action/event/outcome schemas、create/restore、事件归约、可见 observation 与当前
decision boundary。decision boundary 只规定跨游戏编排所需的行为：

- `single`：一个 actor 提交一个动作；同一 actor 可以连续获得新的 boundary；
- `barrier`：多个 actors 从同一 observation revision 决策，动作密封后按声明顺序成批提交；
- 每个 actor 的 `ActionSpec` 声明结构化工具或直接文本输入、Zod schema 与可见 stream audience；
- 卡牌栈、优先权、技能触发与复杂阶段仍由游戏 Ruleset 状态机拥有，并通过后续 boundary 表达。

Core 将确定性游戏事件与 Session、delivery、trajectory 等运行记录分流。通用 audience 支持 public、
host、participant set 与 group；每个游戏负责把原始状态投影为已授权 observation、Prompt facts 与 Web
DTO。Match、Session binding、delivery、trajectory 和 simulation 使用 ports；Core 提供参考 SQLite
实现，AgentWolf 首阶段继续使用现有 wire、快照与数据库结构实现这些 ports。

测试基础框架作为 Core 正式能力：

- repository harness 提供 gate phase、依赖方向、文件发现、文档链接、生成物和可配置 policies；
- runtime testkit 提供 mock ACP Agent、进程树、scripted Session、内存 store 与并发/failure drivers；
- simulation workflow 提供 candidate、脱敏、非覆盖批准、确定性复跑、engine/orchestration 双 runner、
  variants、差异定位与 reviewed oracle；
- 游戏 adapter 提供 canonicalizer、checkpoint、invariants、动作执行和可选 runtime controls。

Core 使用两个无产品内容的 headless conformance game 证明通用性。`hidden-team` 验证团队私有事实、
文字 stream、轮换 actor 与 barrier；`reaction-card` 验证确定性牌堆、资源区、连续行动、pass、嵌套
响应和响应窗口恢复。AgentWolf 随后作为完整消费者迁移，纯抽取不得改变其公开 DTO、Prompt、事件
oracle、Ruleset fingerprint 或浏览器行为。

## Alternatives considered

**继续在 AgentWolf 仓库增加通用 packages。** 联调简单，但仓库身份、发布节奏与游戏产品边界保持
耦合，Avalon 等项目无法成为独立消费者。

**复制 AgentWolf 作为每个游戏的模板。** 初期最快，但 ACP 修复、隐私门禁、仿真能力与 Provider
适配会在多个仓库分叉。

**只抽取 ACP，不抽取 Ruleset 与 harness。** 可以复用模型进程，却会让每个游戏重新实现规则锁定、
barrier、可见性审计和确定性回归，无法形成完整对战平台。

**立即发布 npm stable packages。** 在第二个消费者和卡牌响应模型验证前冻结公开 API，会把尚未证明
的抽象变成兼容负担。开发阶段先使用 submodule 固定真实跨仓边界。

## Acceptance criteria

- `agent-arena-core` 可以独立安装、构建、测试；`ruleset` 与 `game-runtime` 只依赖 `contracts`，
  游戏语义在独立模块中组合两者的公开扩展点。
- Ruleset Core 保留 plugin 依赖、配置 schema、semantic ownership、revision/lock/fingerprint、
  phase graph 与有界 resolution 的机械校验。
- 两个 conformance games 通过 create、action validation、event replay、visibility、barrier、restart
  与 simulation 双 runner 验证。
- Core ACP runtime 证明单次 `session/new`、精确 ID resume、pending action 先于成功回执持久化、
  uncertain delivery 对账和有界进程关闭。
- AgentWolf 通过公开 Core packages 运行，现有 wire schemas、数据库、Match archive、Ruleset family/
  revision、Prompt 与用户可见行为保持兼容。
- AgentWolf 的完整仓库门禁、approved simulation corpus 与浏览器套件通过，fixture oracle 不因纯
  抽取而刷新。
- repository harness 与 simulation workflow 各自拥有独立 self-tests，游戏专属 policy 和 invariant
  通过 adapter/config 注入。

## Risks

- 过度泛化可能把简单的规则组合变成难以理解的泛型框架；只抽取被 AgentWolf 与两个 conformance
  games 同时证明的接口。
- submodule 会增加双仓提交顺序和 CI 初始化要求；Core commit 与 AgentWolf pointer 更新必须分开
  审查，AgentWolf CI 必须初始化固定 submodule revision。
- 当前 GameState、action union、event union、Prompt facts 与 simulation checkpoint 共享领域类型；
  兼容 adapter 保持 wire 与数据库边界，并按职责逐步接入 Core ports。
- 卡牌响应窗口和社交推理 barrier 的控制流不同；Core 只编排 decision boundary，不拥有具体栈或
  触发规则。
- 运行中 Match 与用户数据不能作为迁移试验；所有破坏性验证使用内存仓库、临时目录或已批准
  fixture。
