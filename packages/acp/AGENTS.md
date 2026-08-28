# ACP package 指南

参见[根 AGENTS.md](../../AGENTS.md)。阅读 [README.md](README.md) 了解包契约,阅读 [ACP Session 运行时](../../docs/architecture/acp-session-runtime.md) 了解 Match 级集成。

保持本包独立于游戏 phase、Roles、Match 仓库与恢复策略。Provider 适配器报告协议/进程结果;它们不创建替代的逻辑 Sessions,也不掩盖传输不确定性。
