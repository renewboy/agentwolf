# Agent Note: 狼人阵营必胜证明

Status: implemented

## Problem

经典 Ruleset 的正式胜负条件只描述狼人全灭、屠边、屠城和 Role plugin 修改后的终局。部分局面中,
狼队已经能够凭借当前票权、夜间行动与对手剩余反制稳定达成同一正式狼人结果,继续创建 Agent 回合
不会改变赢家。单独比较存活人数或票数无法覆盖 Sheriff、药物、保护、死亡技能、情侣关系、Role
转换与隔离狼队,也可能把狼队看不到的真实身份作为策略输入。

## Decision

Ruleset 组合一份 `EndgameRegistry`。每个 Role 显式声明 `endgameModel`,每个 ability 声明
`endgameImpact`;拥有 material ability 或其他终局物质语义的 Role plugin 注册有限的
`EndgameRoleModel`。Ruleset 构建验证 material ability IDs 完整对应模型,并拒绝缺失、重复或引用
未知 Role 的声明。加入夜间 batch 的 ability 还声明 `nightResolutionStage`;保护与狼刀进入
`wolf-priority`,毒药和查验进入 `post-wolf-priority`,所有 `nightAttack` 都由构建门禁强制进入前者。

Victory registry 将正式评估与 forced evaluator 分层。基础 evaluators 和 modifiers 先产生正式
结果;只有没有正式结果时,经典 Ruleset 才运行狼人阵营必胜证明。证明成功后生成 reason 为
`werewolf-forced-win` 的普通 `match.ended`,继续使用现有 Faction 与明确 `winningPlayerIds` wire
契约。赛后资格直接消费该终局事件,不根据仍然存活的玩家重新计算胜负。

狼人求解器从最近的阵营名册、公开事件与控制组成员私有可见事件构造共同观察,并从冻结 board
牌池展开所有兼容隐藏 Role 组合。共享阵营知识的狼队形成一个控制组;Awakened Hidden Wolf 只有
在自己的已知能力允许时形成独立控制组。Cupid 与 Thief plugin 分别约束关系可见性和有效身份牌池。
第三方目标存在、关系未知、底牌选择不可见或赢家集合不能保持一致时,证明不成立。

夜间 batch 先单独结算 `wolf-priority` effects,展开狼刀死亡及自动死亡链,并在临时 state/events 上
运行完整 formal-only VictoryRegistry。该检查得到狼人正式候选时,Victory plugin 以事件固定候选和
赢家 IDs;后序毒药、查验与交互式死亡技能不再执行。检查没有得到狼人候选时,引擎继续结算完整
夜间 batch。该顺序由 ability 元数据、effect、trigger 和胜负 registry 驱动,不按 Role ID 分支。

每个控制组采用对不可区分状态一致的目标策略。白天搜索区分首轮投票、平票 PK 复投和复投平票
流局;夜间搜索遵循同一狼刀检查点。其他玩家的投票、Witch 药物、Guard 保护、Hunter 开枪、Idiot
放逐免疫、Sheriff 权重与当前 Role 模型作为全称反制。规范化状态以 memoization 求解;
循环、未建模组合、冲突结果或确定性节点上限耗尽都返回无候选,对局继续。Village、情侣第三方与
其他阵营不产生提前胜负候选。

普通终局先结算自动关系死亡与仍合法的交互式死亡技能。狼刀胜负锁已包含自动关系死亡,并关闭
交互式死亡技能窗口。两条路径都先完成已有资格的终局遗言,再进入 `phase-match-ended`,不会执行
后续 Sheriff 操作、夜晚、发言或投票。

## Alternatives considered

**狼人票数不小于其他票数即结束。** 该阈值无法证明技能、关系和警徽操作已经不能改变局势。

**使用 God 视角选择最优目标。** 该策略可能依赖狼队不知道的 Role、药物或情侣关系。

**同时为第三方阵营求解。** 第三方成员没有稳定的共同身份知识与控制面,不能成为可靠的自动候选。

**枚举完整 GameEngine 历史。** 过滤后的狼队观察无法唯一重建替代隐藏历史,且会把发言、投递等无
物质影响状态带入终局求解。

## Consequences

- 狼刀已经形成正式狼人结果时,Match 在死亡公布与终局遗言后结束,不允许后序效果逆转。
- 尚未达到正式胜负但已证明狼人必胜的 Match 在当前合法死亡技能与遗言后结束。
- 隐藏身份只扩大 belief 集合,不能帮助狼队选择目标;无法证明的复杂局面保持原流程。
- Role 开发必须同步维护 endgame 分类与 material 模型,新增终局能力不会被默认忽略。
- 现有正式胜负、Cupid 第三方、事件 schema、Match projection 与 archive 格式保持统一。
- 当前 Ruleset revision 和批准的 engine/orchestration 仿真语料共同冻结该语义。

## Verification

Role registry、经典 Role 组合、隐藏身份、Cupid、Thief、Witch、Guard、Hunter、Idiot、White Wolf
King、Awakened Hidden Wolf 与 terminal re-evaluation 具有聚焦覆盖。真实 MatchRuntime 测试断言
`werewolf-forced-win` 终局及赛后生命周期;revision 9 仿真语料冻结狼刀检查点、提前终局、警长长局
与暂停恢复语义。仓库总门禁和浏览器流程验证构建、覆盖率、Prompt、投影、trajectory、postgame 与
可见交互保持一致。
