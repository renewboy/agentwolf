# Game engine package

`@agentwolf/game-engine` 是 AgentWolf 确定性、无 IO 的狼人杀运行时。它归约 append-only 事件流、校验动作、推进由插件组合的 phase 图、结算效果并判定胜负。

## 职责

- 版本化的 Ruleset 与 RulePlugin 安装。
- Role、Ability、capability、phase、query、trigger、interrupt、event、resolution 与胜负 registries。
- 内置与自定义 board manifests。
- 纯函数的动作校验、状态归约、可见性过滤、发言规范化与 replay。
- 确定性的投票裁决、发言顺序、效果结算与终局评估。

完整的跨包模型见[游戏运行时架构](../../docs/architecture/game-runtime.md)。

## 边界

本包只依赖 contracts 与 Zod。它不执行文件系统、数据库、网络、子进程、Prompt、本地化或浏览器工作。它不知道 Agent Profiles、Character 卡、ACP Sessions、Match 仓库或视觉特效。

通用内核不包含任何具体 Role 或 Ability IDs。Ruleset 插件持有具体语义;capability 将共享机制接入有资格的 Roles。

## 扩展点

RulePlugin 通过 `RulesetBuilder` 在某个安装作用域下注册语义。注册会记录插件归属者,并在重复时失败。新 Roles 使用这些 registries,而不是修改内核的中央 switch。

Boards 选择冻结的 phase 图与策略。已发布的 schema-two 快照绑定唯一确切的 Ruleset lock 与 fingerprint;不兼容的已安装语义会导致 restore 失败。

## 验证

使用包内单元测试与 property 测试覆盖规则、状态归约、可见性、结算与 replay。跨层的 Prompt、Session、持久化与浏览器行为属于 server/assets 集成测试或 E2E 测试,而非本包。
