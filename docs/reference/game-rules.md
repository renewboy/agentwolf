# 采用的游戏规则基线

狼人杀的各实现夜晚顺序、女巫自救、守卫交互、警长打断、遗言与胜负判定各不相同。AgentWolf 在
每份 board 快照中冻结所选变体;游戏引擎与生成目录保持为可执行的权威。

## 共享政策

- 普通淘汰保持 Role 身份隐藏,直到 Role 特定的公开揭示或 Match 结束。
- 标准警长 board 在首夜动作之后、死亡宣告之前进行警长竞选。候选人发言、可退选,原非候选人
  投票。一次平票进入 PK;第二次平票警徽流失。
- 白天放逐首轮最高票平票时,平票玩家进行 PK 发言,其余有票权玩家复投;复投仍无唯一最高票时
  本轮无人被放逐并直接进入夜晚。
- 存活的 Sheriff 拥有 1.5 倍投票权重,选择白天发言方向,并最后发言。当前的单次爆狼政策是:
  竞选爆狼阻止选举产生时警徽流失。
- 夜间遗言在启用时仅限首夜。
- Witch 每晚最多使用一种药水,不能自救。守卫与解药落在同一目标时结算为死亡。守卫可以自守,
  但不能在连续两晚保护同一名玩家。
- 首夜先由 Thief 完成底牌选择,再由 Cupid 建立情侣关系,随后进入 Guard、普通 Werewolf 攻击、
  Witch 与查验类 Roles;
  后续夜晚从 Guard 开始。Ruleset 阶段图拥有确切顺序。
- 本局采用狼刀在先规则:白天公布夜间出局信息后,若好人与狼人同时满足胜利条件,判狼人阵营获胜。
- 普通狼人攻击由每名有资格的狼队成员投一张私密票。`null` 表示明确的空刀,且仅在严格压过
  每个玩家目标票数时生效。玩家目标最高票平票时使用一次 Match 与夜晚内稳定的选择。
- 正式胜负条件未发生时,Ruleset 只为狼人阵营计算必胜证明。证明使用狼队实际可见的身份、公开
  事实、冻结牌池、票权和技能资源,并要求同一策略覆盖所有兼容隐藏状态及其他玩家的全部合法
  反制。无法得到唯一狼人结果时继续对局;好人、情侣第三方与其他阵营不产生提前胜负候选。技术
  流程见[游戏结算与终局](../architecture/game-settlement.md)。

白天发言顺序使用已发出的、replay 稳定的选择。有存活 Sheriff 时,单一夜晚死亡以死者为锚点;
平安夜或多人死亡时以 Sheriff 为锚点。没有 Sheriff 时,单一死亡或最低 Seat 的多人死亡为锚点;
平安夜选择一个稳定的起点与方向。

每局冻结公开发言 interrupt 模式。`legacy` 只在当前行动者回合开放 Phase 声明的 interrupt;
`rolling` 在公开发言阶段入口和每段发言期间同时唤醒其他合格玩家。刚完成自己发言的玩家不立即获得旁听判断,直到另一名玩家的新发言到达。自爆可以发生在当天首段公开
文本之前或中断正在进行的发言;已经公开的干净文本保留,随后白天流程中止并进入既有死亡、遗言、
胜负与夜晚链路。新一天重新开放同一窗口,因此存活狼人可以连续执行爆刀计划。

## 已安装的特殊变体

Mirror Hidden board 包含两名狼队 Werewolf 与一名 Awakened Hidden Wolf。被隔离的 Role 与狼队
互不知情、可以互相指定为目标,且不共享狼人会议。Awakened Hidden Wolf 可学习一次,在注册的
时序下接收复制的能力,并在狼队被淘汰后获得自己的攻击。学习 Werewolf 授予一次双重攻击,其
同目标变体无视 Guard 与解药保护。

Magic Mirror Girl 收到确切的 Role 结果,且不能查验同一目标两次。White Wolf King 参与狼队
投票,但使用自己的定向白天自爆而非普通 Werewolf 自毁。由此产生的死亡进入共享的触发与胜负
管线。

Mirror Hidden board 中,Awakened Hidden Wolf 先完成当夜学习,Magic Mirror Girl 随后选择查验目标。
若 Awakened Hidden Wolf 当夜完成学习,Magic Mirror Girl 查验其结果为所学 Role;尚未学习时显示
Awakened Hidden Wolf。除 Hunter 死亡反应外,复制能力从下一夜起才可主动使用。

Cupid 在首夜强制连接两名不同的存活玩家,可以自连。情侣只知道彼此,不知道对方 Role 或未自连
时的 Cupid;Cupid 不知道情侣 Role。情侣不能在放逐及放逐 PK 中互投,一方以任何原因出局时另一方
立即殉情。殉情不可阻止,不能触发殉情者的死亡能力,并继承原死亡的昼夜时点与遗言资格。狼刀
检查点未锁定狼人胜利时,原死亡者仍按原因决定是否发动死亡能力;死亡能力及其后续殉情完成后才
进入遗言或终局。

情侣在夜里形成连锁死亡时,天亮只公布完整死亡名单,不公开区分原死亡与殉情;采用当前
`first-night-only` 政策时,首夜两人都有遗言,后续夜晚两人都没有遗言。情侣一方被白天放逐时,
先宣布该玩家出局,再立即宣布另一方殉情,两人均有遗言且按原死亡者、殉情者的因果顺序发言。
满足胜利条件的死亡批次仍先完成有资格的遗言,随后进入终局。Match 结束并公开全部身份后,
情侣关系同时向所有视角公开。

人人恋随好人胜负,狼狼恋随狼人胜负,均不改变原阵营终局阈值。人狼恋中的 Cupid 与情侣形成固定
第三方获胜集合;Cupid 存活或情侣共同存活时,普通阵营不能提前结束对局,圈外存活玩家清零后第三方
获胜。12 人预女猎爱场由四狼、四民、预言家、女巫、猎人和 Cupid 组成,采用上警屠边。

Thief board 使用完整身份牌池发牌,并留下两张底牌。Thief 可能成为底牌而不在场;在场时首夜最先
查看两张底牌并必须选择一张作为最终 Role,另一张不进入对局。底牌包含 Werewolf Faction Role 时
只能选择该牌。最终 Role 立即决定 Faction、阵营知识、能力、查验与胜负,并参与本夜后续阶段。

12 人盗丘场的十四张身份牌由三名 Werewolf、五名 Villager、Seer、Witch、Hunter、Idiot、Cupid 与
Thief 组成,采用上警屠边。合法发牌保持三张狼人牌最终在场:Thief 在场时底牌最多包含一张狼人牌,
Thief 成为底牌时另一张底牌不能是狼人牌。Match 结束并公开最终身份后,同时公开底牌与 Thief 的
选择结果。

## 来源

- [官方角色、板子、胜负与遗言规则](https://langrensha.com/wanfa/guize/2017/10/18/26899_719311.html)
- [官方首日警长流程](https://www.taptap.cn/moment/658304304670575860)
- [警长平票与打断变体](https://zh.wikiversity.org/zh-cn/%E7%8B%BC%E4%BA%BA%E6%AE%BA/%E9%81%8A%E6%88%B2%E8%A7%92%E8%89%B2/%E8%AD%A6%E9%95%B7)
- [Werewolves of Miller's Hollow 规则书](https://www.gokids.com.tw/tsaiss/gokids/rules/BestOf_EN_CH%20rules.pdf)
- [Awakened Hidden Wolf 板子与查验行为](https://shouyou.gamersky.com/news/202409/1811620.shtml)
- [Awakened Hidden Wolf 复制能力](https://langrensha.net/news/20240905-5.html)
- [官方丘比特板子与胜负规则](https://www.taptap.cn/moment/15208420701372848)
- [官方盗贼规则与板子配置](https://langrensha.com/wanfa/guize/2017/10/18/26899_719311.html)
- [官方盗贼攻略与恒定狼数](https://langrensha.com/m/hantiao/juese/2018/07/09/26896_763564.html)
- [情侣死亡、猎人和遗言细则](https://www.langrensha.net/strategy/2021050801.html)
- [绑票中的人数、警徽与技能条件](https://lanke.fun/wp-content/uploads/2023/10/%E7%83%82%E6%9F%AF%E6%B8%B8%E8%89%BA%E7%A4%BE%E7%8B%BC%E4%BA%BA%E6%9D%80%E6%B3%95%E5%85%B8.pdf)
- [官方狼刀在先屠边终局说明](https://langrensha.com/news/strategy/20210222/30886_933042.html)
- [官方猎人攻略中的狼刀在先说明](https://langrensha.com/m/hantiao/juese/2018/07/09/26896_763550.html)
- [狼人杀胜负判定规则汇总](https://langrensha.net/news/20240905-8.html)
