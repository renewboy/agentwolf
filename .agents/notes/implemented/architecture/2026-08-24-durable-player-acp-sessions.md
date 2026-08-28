# Agent Note: 持久玩家 ACP Sessions

Status: implemented

## Problem

把 Agent 进程当作玩家 Session 会让超时与 server 重启丢失 provider 历史、创建重复的奠基记录、
重放已确认的事实,并打扰连接原本健康的玩家。

## Decision

每个 Match seat 只调用一次 `session/new`,并持久保存返回的逻辑 Session ID,连同其启动快照、
bootstrap 状态、已确认事件 cursor 与已接受的结构化动作。进程可以重启,但它通过 `session/resume`
以完全相同的 ID、当前玩家 workspace 与刷新后的 MCP 授权重连。

每名玩家、每个阶段的一次不确定投递可以继续使用健康连接,或恢复该玩家的 Session。已投递范围
只前进一次,并且 Session 收到一份紧凑的当前阶段续跑内容。已持久接受的动作在不追加 Prompt 或
提交的情况下完成对账。反复失败或恢复失败会暂停 Match。

赛后复盘保留同样的 seat Session 直至完成或跳过。确切生命周期定义于
[ACP Session 运行时](../../../../docs/architecture/acp-session-runtime.md)。

## Alternatives considered

**在传输失败后创建替代 Session。** 这会丢失 provider 历史、重复奠基记录,并违反一名玩家一个
Session 的身份约束。

**把完整可见历史重放进新 Session。** AgentWolf 已经持有事件投递 cursor;完整重放会重复已知
事实,且无法重建 provider 本地的推理状态。

**同时重启所有玩家。** 玩家局部的传输失败不得改变健康玩家的进程、cursor 或动作状态。

## Consequences

逻辑 Session 身份在进程与 server 生命周期之外存续。恢复依赖 provider 的 resume 支持,并在其
不可用时以失败关闭。Session 绑定与已接受动作是运营性的持久状态,而非诊断信息。
