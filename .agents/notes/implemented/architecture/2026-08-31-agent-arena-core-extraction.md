# Agent Note: Agent Arena Core 跨游戏基础框架

Status: implemented

## Problem

事件驱动的多 Agent 桌游共享规则组合、决策编排、ACP Session、隐藏信息、轨迹与确定性仿真能力，
同时必须让每个游戏独立拥有 state、action、event、projection、Prompt 语义与产品界面。共享能力如果
依附某个游戏的领域类型，其他游戏就无法复用；游戏语义如果进入平台内核，平台也无法维持稳定边界。

不同游戏还具有不同的决策形态：隐藏团队游戏需要团队私有事实和密封 barrier，卡牌游戏需要连续
行动与嵌套响应，文字推理游戏需要公开 stream 与轮换 actor。基础框架需要统一这些编排契约，又不能
接管具体规则状态机。

## Decision

`agent-arena-core` 是独立 MIT 仓库，公开 package 使用 `@agent-arena/*` scope。AgentWolf 通过
`vendor/agent-arena-core` Git submodule 固定 Core commit；Core 与 AgentWolf 分别提交和审查，
AgentWolf 只通过 Core 的公开 package 边界消费平台能力。

Core 拥有通用 contracts、Ruleset 组合、确定性 game runtime、Match 编排、ACP runtime、Prompt
bundle runtime、参考 SQLite stores、trajectory、simulation、repository harness 与 runtime testkit。
AgentWolf 拥有狼人杀 action/event/state、Role、Faction、board、projection、Prompt 内容、SQLite
产品 schema、Match 舞台、Role 动效与赛后复盘。

Ruleset 以泛型 `RulePlugin<Registrar>` 为扩展入口。Core 校验依赖、配置、安装作用域、semantic
ownership、revision、lock、fingerprint、phase graph 与有界 resolution agenda；游戏模块提供自己的
Registrar、registries 和编译结果。

`GameModule` 是 Match runtime 的游戏边界，提供 setup/state/action/event/outcome schemas、创建与
恢复、事件归约、授权 observation 和当前 `DecisionBoundary`。boundary 只包含两种平台语义：

- `single` 允许一个 actor 提交动作，并允许同一 actor 连续获得后续 boundary；
- `barrier` 让有序 actors 从同一 observation revision 决策，完整密封后按声明顺序成批提交。

每个 actor 的 `ActionSpec` 声明结构化工具或直接文本输入、输入 schema 与 stream audience。卡牌栈、
优先权、Role 技能和阶段跳转由游戏状态机表达。Core audience 只定义 public、host、participant set
与 group；游戏负责生成授权 observation、Prompt facts 和浏览器 DTO。

Match、Session binding、delivery、trajectory 与 simulation 通过 ports 持久化。Core SQLite adapter
提供 module-scoped migrations 与可重启参考实现；AgentWolf adapters 保持其产品 wire、快照、归档与
数据库边界。确定性游戏事件和 Session、delivery、trajectory 运行记录使用独立数据流。

Core 的 `hidden-team` 与 `reaction-card` conformance games 共同约束公开 API。前者覆盖团队私有事实、
文字 stream、轮换 actor 与 barrier；后者覆盖确定性牌堆、连续行动、pass、嵌套响应与响应窗口恢复。
两者都通过同一 simulation workflow 验证 candidate、review、approve、双 runner、重复执行、失败注入
与 restart。

## Alternatives considered

**在 AgentWolf 仓库内维护通用 packages。** 这会让平台发布节奏与狼人杀产品边界保持耦合，其他
游戏不能成为独立消费者。

**复制 AgentWolf 作为每个游戏的模板。** ACP 修复、隐私门禁、仿真能力和 Provider 适配会在多个
仓库形成分叉。

**只共享 ACP runtime。** 每个游戏仍需重复实现规则锁定、barrier、可见性审计、轨迹与确定性回归，
不能形成完整对战平台。

**直接冻结 npm stable API。** 现有跨仓开发边界需要精确 commit pin；submodule 能让 Core 与消费者
变更保持可审查的原子对应关系。

## Consequences

- 新游戏通过实现 `GameModule`、Ruleset Registrar、projection、Prompt facts 与 simulation adapter
  接入，无需修改 Core 的 Match、ACP、trajectory、simulation 或 repository harness。
- AgentWolf 的通用回合、Session store、Prompt loader、trajectory、simulation 与仓库门禁由 Core
  运行，狼人杀语义继续由 AgentWolf packages 和 server adapters 持有。
- Core API 必须同时通过两个 conformance games 与 AgentWolf 消费者验证；只服务单一游戏的抽象不能
  进入平台公共契约。
- submodule pointer 是 AgentWolf 构建输入。CI、安装与审查必须初始化并核对固定 Core revision。
- 运行中 Match 和用户数据库不承担框架验证；真实验收使用隔离端口、临时数据目录或已批准 fixture。

## Verification

Core 独立门禁验证构建、逐文件覆盖率、架构纯净性、repository policies、ACP 生命周期、SQLite
restart、两套 conformance games 与双 runner workflow。AgentWolf 在每次 Core pointer 更新时运行完整
仓库门禁、approved simulation corpus 和浏览器套件；Provider 边界通过精确模型与 reasoning 配置的
live Session 创建、动作提交和同 ID resume 验证。完整 Match 验收同时检查多视角隐私、密封 barrier、
流式发言、终局归档、赛后流程、轨迹与数据库完整性。
