# ACP package 指南

参见[根 AGENTS.md](../../AGENTS.md)。阅读 [README.md](README.md) 了解包契约,阅读 [ACP Session 运行时](../../docs/architecture/acp-session-runtime.md) 了解 Match 级集成。

Core package 持有通用 ACP 协议、进程、Session 与 delivery 实现;本包持有 AgentWolf Tool catalog、
Provider launch policy 与玩家隔离配置。Provider 适配器报告协议/进程结果;Match 恢复策略留在 server。
