# ACP package 指南

参见[根 AGENTS.md](../../AGENTS.md)。阅读 [README.md](README.md) 了解包契约,阅读 [ACP Session 运行时](../../docs/architecture/acp-session-runtime.md) 了解 Match 级集成。

Core package 持有通用 ACP 协议、进程、Session 与 delivery 实现;本包持有 AgentWolf Tool catalog、
Provider adapter registry 以及 workspace/state/launch/Session policy。Provider 适配器报告
协议/进程结果;Match 恢复策略留在 server。新 Provider 通过注册 adapter 扩展，不在
Session factory 中增加 kind 分支。
