# ACP package

`@agentwolf/acp` 将固定 Core revision 的 Agent Client Protocol 运行时绑定到 AgentWolf Tool 目录与
玩家隔离策略。

## 职责

- 内置的 Trae、Codex、Claude、CodeBuddy 与自定义 Agent Tool 定义；只有绑定经过验证
  Provider adapter 的 Tool 可以启动玩家 Session。
- Core `AcpSession`、`AgentProcess`、delivery ledger 与 lifecycle errors 的兼容入口。
- 对 active Prompt 发送标准 `session/cancel`,同时保留原 Prompt response 作为取消完成边界。
- `PlayerProviderRegistry` 与 Provider adapter 契约，组合 workspace、state、launch 和 Session
  policy。
- Match-owned Provider home、隔离 launch workspace 与 sandbox 能力声明。
- 通用的 delivery-ledger 类型与不确定送达错误。
- 进程组监督与有界关闭集成。

Match 级生命周期见 [ACP Session 运行时架构](../../docs/architecture/acp-session-runtime.md)。

## 边界

Core runtime 拥有 ACP 协议、进程与 delivery 原语。本包拥有 Agent Tool catalog、Provider 启动配置和
玩家权限策略。server 提供 workspace、MCP endpoint、所选模型/配置、持久 Session ID 与送达决策。

Provider 适配器必须保持同一个逻辑行为:创建一次,恢复给定的 Session ID,按序流式传输 updates,并报告最终完成或传输失败。它们只可以在该 provider 所声明的启动/配置机制上存在差异。

玩家启动必须把 server 渲染的 foundation 固化为该 Seat 的主指令，关闭宿主记忆、项目规则、
IDE 与协作上下文，收窄模型可见工具并隔离 Provider 状态目录。玩家 Skills 由各
Provider 的原生 discovery 机制按名称暴露，Skill 入口不作为主指令文件。无法机械建立这些边界的
Provider 在创建 ACP Session 前失败。
默认 adapters 通过精确名称白名单、project-only source 或 bundled/ambient 禁用规则，使宿主和
workspace 祖先目录中的非玩家 Skills 不进入玩家上下文。

主动取消只发送 ACP cancel notification,不创建并发 Prompt。server 在原 Prompt 结束前不会发送后继
Prompt,并自行决定该完成属于 supersede、已接受动作还是不确定传输。

## Provider adapter 模型

`PlayerProviderRegistry` 先按精确 Agent Tool ID 解析 adapter，再按 Tool kind 解析。默认 registry
注册 Trae、Codex、Claude 和 CodeBuddy；自定义 Tool 只有在注册经过验证的精确 adapter
后才能启动玩家 Session。

| policy    | 责任                                                             |
| --------- | ---------------------------------------------------------------- |
| workspace | 解析 launch 目录，准备 Skill 链接，并按 lifecycle key 去重清理   |
| state     | 准备 Match-owned Provider home，只引用允许的宿主凭据             |
| launch    | 从原始 Tool command/args/environment 生成仅游戏进程配置          |
| Session   | 声明 MCP 传输方式、可见工具、resume 验证、permission 与 metadata |

`preparePlayerProviderSession` 是唯一编排入口。它固化 foundation 主指令，执行 registry 解析和
四类 policy，返回 server 可直接传给 `AcpPlayerSession.start` 的完整 Session spec 与实际生效的
foundation 文本。server 使用该文本记录 bootstrap trajectory。

## 失败行为

协议关闭是有界的。进程监督通过所属进程组逐级升级终止。传输不确定性会报告给 server,而不是通过再创建一个 Session 或重放历史来掩盖。

测试使用假的 ACP 进程来获得确定性的协议行为;live adapter smoke 测试仍需凭据,并与无密钥的 CI 分离。
