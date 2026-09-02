# Agent Note: 持久玩家 ACP Sessions

Status: implemented

## Problem

把 Agent 进程当作玩家 Session 会让超时与 server 重启丢失 Provider 历史、为同一 Seat 建立新的
foundation 主指令上下文、重复 bootstrap 与已确认事实,并打扰连接原本健康的玩家。

## Decision

每个 Match Seat 只调用一次 `session/new`。首次创建前,该 Seat 渲染后的 foundation 固化为不可变
主指令;运行时持久保存返回的逻辑 Session ID,连同其启动快照、bootstrap 状态、已确认事件 cursor
与已接受的结构化动作。进程可以重启,但它通过 `session/resume` 以完全相同的 ID、当前玩家
workspace、同一份主指令与刷新后的 MCP 授权重连。

每名玩家、每个阶段的一次不确定投递可以继续使用健康连接,或恢复该玩家的 Session。已投递范围
只前进一次,并且 Session 收到一份紧凑的当前阶段续跑内容。已持久接受的动作在不追加 Prompt 或
提交的情况下完成对账。反复失败或恢复失败会暂停 Match。

赛后复盘保留同样的 seat Session 直至完成或跳过。确切生命周期定义于
[ACP Session 运行时](../../../../docs/architecture/acp-session-runtime.md)。
Provider 主指令与 Skill 边界定义于
[玩家 Provider 隔离与 Skill 发现](2026-09-01-player-provider-isolation-and-skill-discovery.md)。

## Alternatives considered

**在传输失败后创建替代 Session。** 这会丢失 Provider 历史、建立第二份主指令上下文,并违反
一名玩家一个 Session 的身份约束。

**把完整可见历史重放进新 Session。** AgentWolf 已经持有事件投递 cursor;完整重放会重复已知
事实,且无法重建 provider 本地的推理状态。

**同时重启所有玩家。** 玩家局部的传输失败不得改变健康玩家的进程、cursor 或动作状态。

## Consequences

逻辑 Session 身份在进程与 server 生命周期之外存续。foundation 由玩家 workspace 持有并作为
主指令生效,bootstrap 的派发与确认由 Session binding 持有;恢复不会把二者重新合并为一份用户
Prompt。恢复依赖 Provider 的 resume 支持,并在其不可用时以失败关闭。Session 绑定与已接受动作
是运营性的持久状态,而非诊断信息。
