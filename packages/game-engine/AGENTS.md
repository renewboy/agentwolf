# Game engine package 指南

参见[根 AGENTS.md](../../AGENTS.md)。阅读 [README.md](README.md) 了解包契约,阅读[游戏运行时架构](../../docs/architecture/game-runtime.md) 了解跨包设计。

保持 engine 确定性且无 IO。通过 Ruleset 插件、capability、registries、events 与 effects 扩展游戏行为,而不是在内核中添加具体 Role 或 Ability 分支。用单元/property 测试与确定性 replay 验证规则变更。
