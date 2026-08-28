# ACP package

`@agentwolf/acp` 提供独立于狼人杀规则与 Match 持久化的 Agent Client Protocol 原语。

## 职责

- 内置的 Trae、Codex、Claude 与自定义 Agent Tool 定义。
- ACP stdio 进程启动、初始化、Session 创建/恢复、更新与关闭。
- Provider 特有的仅游戏启动策略与 sandbox 能力声明。
- 通用的 delivery-ledger 类型与不确定送达错误。
- 进程组监督与有界关闭集成。

Match 级生命周期见 [ACP Session 运行时架构](../../docs/architecture/acp-session-runtime.md)。

## 边界

本包了解 ACP 协议与进程语义,但不了解游戏 phase、Roles、可见性、仓库、已接受的动作或 Match 恢复策略。server 提供 workspace、MCP endpoint、所选模型/配置、持久 Session ID 与送达决策。

Provider 适配器必须保持同一个逻辑行为:创建一次,恢复给定的 Session ID,按序流式传输 updates,并报告最终完成或传输失败。它们只可以在该 provider 所声明的启动/配置机制上存在差异。

## 失败行为

协议关闭是有界的。进程监督通过所属进程组逐级升级终止。传输不确定性会报告给 server,而不是通过再创建一个 Session 或重放历史来掩盖。

测试使用假的 ACP 进程来获得确定性的协议行为;live adapter smoke 测试仍需凭据,并与无密钥的 CI 分离。
