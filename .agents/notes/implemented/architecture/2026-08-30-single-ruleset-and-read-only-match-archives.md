# Agent Note: 单 Ruleset 执行与只读 Match 归档

Status: implemented

## Problem

可执行 Ruleset 与终局历史读取如果共用事件恢复路径,当前规则实现就必须长期携带旧 plugin 组合、
事件 schema 与 runtime factory。规则演进会持续增加兼容分支,而查看一场已结束 Match 并不需要执行
领域规则。

## Decision

Ruleset 使用稳定 family ID `classic` 与整数 revision。server release table 为每个 family 声明唯一
当前 revision、默认标记与 runtime factory。只有 snapshot lock 与当前 revision/fingerprint 完全一致
的 Match 可以建立 GameEngine；其他 revision 不具有执行入口。

完成赛后流程的 Match 生成规则无关的 `MatchArchive`。archive 冻结 god、closed-eye 与逐 Player 的
`MatchView`,并保存终局 trajectory audit。Match 列表、查看、WebSocket 视角切换和 audit 直接读取
archive；开始、继续与赛后控制以只读 conflict 失败。仿真采集只读消费 Match 保留的 snapshot、事件与
轨迹，不恢复生产 runtime，也不修改 archive。完整投影集合只停留在 server/SQLite 边界,响应只选择
请求视角。

Match snapshot 与核心死亡/终局事件各有一份当前 schema。历史 Ruleset runtime、旧 plugin 事件呈现
和多版本 snapshot resolver 不属于生产运行时。本决策取代已归档的
[版本化 Ruleset 插件运行时](../../archived/architecture/2026-08-24-versioned-ruleset-plugin-runtime.md)
中的历史 resolver 契约。

## Alternatives considered

**长期安装只读 legacy runtime。** 历史查看仍会依赖旧规则代码,不能消除兼容分支。

**自动迁移进行中 Match。** 需要转换 barrier、pending action、Session 与未完成 Turn,其复杂度与低频
价值不相称。非当前 revision 的未归档 Match 由操作者结束或删除。

**删除全部历史 Match。** 实现最简单,但会丢失已完成的时间线、视角事实、轨迹与赛后复盘。

## Consequences

- 当前规则 plugin 保持单一路径,不通过布尔参数同时表达多代行为。
- Ruleset revision 变化前,旧 Match 必须完成归档或由操作者处理；archive 不依赖历史代码。
- archive 存储多份授权后投影,以空间换取稳定读取与明确隐私边界。
- 原始事件与轨迹继续作为只读审计和仿真来源,但 archived Match 不把它们作为生产恢复输入。
- 活动仿真 corpus 只覆盖 release table 的当前 revision。

## Verification

架构门禁拒绝生产代码和活动仿真语料中的 `classic-vN`、历史 Ruleset factory 与 legacy Cupid
presentation。Catalog、repository、生命周期、projection、trajectory、simulation 与浏览器测试共同
验证当前 lock、archive 视角隔离、只读运行控制和隔离仿真采集。
