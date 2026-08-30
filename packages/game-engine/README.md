# Game engine package

`@agentwolf/game-engine` 是 AgentWolf 确定性、无 IO 的狼人杀运行时。它归约 append-only 事件流、校验动作、推进由插件组合的 phase 图、结算效果并判定胜负。

## 职责

- 版本化的 Ruleset 与 RulePlugin 安装。
- Role、Ability、capability、phase、action validator、query、trigger、interrupt、event、resolution 与胜负 registries。
- 内置与自定义 board manifests。
- 纯函数的动作校验、状态归约、可见性过滤、发言规范化与 replay。
- `AgentWolfGameModule` 对现有 action/event/audience/observation 的 Core `GameModule` 适配。
- 确定性的投票裁决、发言顺序、效果结算与终局评估。

完整的跨包模型见[游戏运行时架构](../../docs/architecture/game-runtime.md)。

## 边界

本包依赖 AgentWolf contracts、Zod,以及固定 Core revision 提供的 Ruleset 组合和确定性运行时入口。
它执行纯规则计算,输入为已解析的 board、动作与事件。

通用内核不包含任何具体 Role 或 Ability IDs。Ruleset 插件持有具体语义;capability 将共享机制接入有资格的 Roles。

## 扩展点

RulePlugin 通过 `RulesetBuilder` 在安装作用域下注册语义。Core plugin loader 与 semantic ownership
记录依赖、配置和归属;AgentWolf registrar 持有 Role、Ability、Phase、event、query、trigger、
interrupt 与 victory registries。关系型规则通过纯 action validator、有界自动死亡反应与有序 victory
modifier 组合;终局候选携带明确获胜 Player IDs。

GameModule adapter 从当前 `TurnDescriptor` 派生稳定 decision boundary，将 AgentWolf visibility 映射为
public/host/participants/group，并在不改变持久事件格式的前提下向 Core Match runtime 暴露 observation
和 action batch。

Boards 选择冻结的 phase 图与策略。唯一 Match snapshot schema 绑定 Ruleset family、当前 revision、
plugin lock 与 fingerprint；只有 Catalog 当前 revision 具有 restore 能力，终局历史由 server archive
读取。

## 验证

使用包内单元测试与 property 测试覆盖规则、状态归约、可见性、结算与 replay。跨层的 Prompt、Session、持久化与浏览器行为属于 server/assets 集成测试或 E2E 测试,而非本包。
