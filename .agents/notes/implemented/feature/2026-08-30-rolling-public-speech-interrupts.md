# Agent Note: 公开发言滚动 interrupt

Status: implemented

## Problem

公开发言阶段的 interrupt 如果只随当前行动者的 ACP 回合开放,其他拥有自爆能力的存活玩家
无法根据正在发生的公开发言即时行动。把所有 interrupt 玩家放入同步 barrier 则会使
下一位发言等待最慢的模型,对局速度取决于后台决策延迟。

ACP Session 同时只接受一个 Prompt。新的公开事实到达时,后台决策需要在同一逻辑
Session 内取消旧判断,同时保证已接受动作不会被取消覆盖,迟到工具调用不会进入新的
expectation,已确认的历史也不会被重复发送。

## Decision

MatchRuntime 为声明了 `PhaseNode.interrupts` 的顺序公开发言维护后台 listener。每名合格
玩家最多拥有一个 listener Prompt,主发言流不等待 listener。进入公开发言阶段时,
listener 与第一位发言者同时启动,因此玩家可以依据同一 Session 中保留的夜间商议,
在任何公开发言产生前自爆。每个后续白天都经过同一阶段入口,允许连续多天自爆。

发言提交后,当前 listener expectation 先关闭,对应 ACP Prompt 通过标准 `session/cancel`
取消。该 Prompt 终止后,同一 Session 只接收玩家确认游标之后新增的可见事件。
取消期间已提交的多段发言合并进下一次增量 Prompt,不重发身份、规则、当前天数、存活名册摘要或已确认历史。
刚完成发言的玩家与下一位发言者一同排除在新 listener 集合外;只有其他玩家的新发言成为增量事实后,前者才重新进入。

listener Prompt 给出 Role 化的决策目标、当前应调用的正式工具名、禁止输出发言边界，以及新增公开事件。MCP tool schema 承载 Ability 语义、字段、枚举、空值和目标结构；当前 expectation 将可用 Ability 收窄为 schema enum。
ActionMailbox 从当前允许能力中稳定选择内部 pass action。

通过 action gateway 验证的第一个 interrupt 动作获得当前竞态。MatchRuntime 终止当前
speech stream,保存已经公开的干净文本,然后通过 Phase 声明的 interrupt 与既有 Role
ability 结算。listener pass、supersede 或失败不阻塞公开发言。通用 engine 与 server 只消费
capability 和 Phase interrupt 契约,不按具体 Role 或 Ability ID 分发。

启动配置提供 `legacy` 与 `rolling` 两种公开发言 interrupt 模式。进程配置只是新 Match
的默认值,选择被写入不可变 setup snapshot,保证恢复与重放不受当前启动参数影响。
缺少该字段的记录按 `legacy` 解析。

## Alternatives considered

**每段发言后的同步 listener barrier。** 语义直接,但公开流程等待全部 listener,使对局速度
取决于最慢模型。

**只允许当前行动者 interrupt。** 它不需要并发与取消语义,但不能支持旁听发言后自爆,
也不能支持白天入口立即自爆。

**向 listener 重发完整 Prompt。** 这会重复 Session 已知的身份、规则与历史,而事件游标
已经能够表达新增公开事实。

**按 speech token 持续刷新 listener。** 这会制造高频取消、重复推理与难以对账的工具竞态。
滚动刷新只发生在已提交的公开发言边界。

## Consequences

- 公开发言的关键路径不等待狼人决策;后台 listener 可以跨发言者连续获得最新事实。
- 白天阶段入口、发言间隙和正在输出的发言共用一个权威竞态,支持拍刀与连续多天自爆。
- 已接受自爆保留已公开的部分发言,并沿既有死亡、trigger、胜负、公告与 `day.interrupted`
  管线结算。
- Provider 必须支持标准 `session/cancel` 完成时序;新 Prompt 在旧 Prompt 终止后才进入同一 Session。
- supersede 会产生额外的模型计算成本,但不增加公开发言等待时间。
- A/B 实例使用独立端口、数据目录与数据库路径,每个 Match 保留其创建时的模式。

## Verification

Engine 测试验证非当前 actor 的 capability 授权与正常动作的 actor 边界。ACP、mailbox 与
PlayerRuntime 测试验证 cancel、supersede、迟到动作与原 Session 恢复。MatchRuntime 集成测试
覆盖默认关闭、白天入口自爆、中断部分发言、增量 Prompt、pass 与连续多天自爆。确定性
仿真对比 engine runner 与真实 MatchRuntime orchestration runner 的结果,并由投影、Prompt、轨迹和
恢复门禁继续约束隐私与重放不变量。
