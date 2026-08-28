# ACP Session 运行时架构

## 职责

该模块拥有 Agent 进程启动、ACP 初始化、每个 Match Seat 一个持久逻辑 Session、模型配置、
流式更新、结构化动作传输、直接发言采集、送达确认、恢复与有界进程关闭。

[`packages/acp`](../../packages/acp/README.md) 提供通用协议/进程原语。
[`apps/server`](../../apps/server/README.md) 将它们绑定到 Match、玩家 token、repository 与
动作预期。

## 边界

- 进程生命周期与逻辑 Session 生命周期相互独立。
- server 拥有 Match 送达游标与已接受动作的持久性;ACP 提供方拥有其 Session 历史。
- 结构化动作只通过玩家绑定的 MCP action gateway 接受。
- 自然发言来自 ACP 响应流与最终响应,而不是普通动作工具。
- 一次传输失败最多只重连一名玩家;它绝不替换全部 Session。

## Session 创建与配置

每个 Seat 在进程启动前保留一个持久绑定。supervisor 启动一个已配置的 ACP stdio 进程,初始化
能力,要求 `session.resume`,并以 Seat workspace 与玩家绑定的 MCP 端点精确调用一次
`session/new`。返回的 Session ID 在 foundation Prompt 之前持久化。

不可变的启动快照记录所选 Agent Tool、命令、模型、可选 reasoning 强度与非机密连接配置。创建
或恢复之后,运行时应用 Profile 模型,随后应用所选的已宣告 reasoning 值。省略 reasoning 值
时保留提供方默认值。

提供方启动策略将游戏 Session 与环境配置隔离。Trae、Codex、Claude 与自定义 ACP 适配器共享
同一逻辑契约,同时使用提供方特定的进程参数与 sandbox 设置。

## 送达台账

一份 Prompt 信封携带一个可见事件范围,并在 `session/prompt` 之前的在途状态下持久化。流式
更新构建轨迹记录。最终的 ACP 响应确认该范围。下一次送达从每玩家已确认游标之后开始,只包含
新可见的事实。

action gateway 在信箱接受之前,针对活跃预期校验一次 MCP 调用。有效动作在工具回执返回之前
即已持久。schema 或规则非法的调用在同一回合内返回失败的工具结果,并保持预期开放以便修正。

并行阶段的动作在信箱中保持密封,直到每个有资格的 ACP 回合落定。Match 运行时按确定性的
Seat 顺序将它们提交给引擎。

## 直接发言

发言采集将干净的自然响应文本与 ACP 角色切换、知识工具输出以及结构化工具流量分离。一次知识
查询可以在发言开始之前完成。一旦干净发言开始,后续工具输出不能进入公开流或 Match 事件。

可见分块流式传送到浏览器。最终响应提供规范文本,并通过同一 Match gateway 提交。已知 Player
ID 被转换为公开引用;未知 `player-N` token 会拒绝该发言以便修正。

## 恢复

不确定的超时、进程退出或传输错误,每名玩家、每个阶段获得一次自动尝试。健康连接原地继续;
否则 supervisor 启动另一个进程,并以持久 ID、当前 workspace 与刷新后的 MCP 授权调用
`session/resume`。

不确定的送达范围只推进一次。同一 Session 随后收到一份紧凑的当前阶段续篇。先前接受的待决
动作被直接消费,不再有额外的 Prompt 或提交。其他每名玩家的进程、Session 与游标保持不变。

重复失败、缺失绑定、不支持的 resume 能力或恢复失败会暂停 Match 等待操作者处理。恢复绝不
调用 `session/new`、不重发 foundation、也不静默替换逻辑 Session。

server 重启从事件重建引擎,加载全部绑定,恢复原始 Session ID,并从每个已确认游标继续。赛后
复盘保持这些相同 Session,直到复盘完成或被跳过。

## 进程监管

在 macOS 与 Linux 上,每个 ACP 命令运行在 guardian 持有的进程组中。guardian 中继 stdio、
观察 AgentWolf 父进程,并在父进程退出或死亡时终止后代进程。正常关闭先限定协议关闭,然后将
进程组从 TERM 升级到 KILL。
