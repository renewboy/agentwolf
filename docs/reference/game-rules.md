# 采用的游戏规则基线

狼人杀的各实现夜晚顺序、女巫自救、守卫交互、警长打断、遗言与胜负判定各不相同。AgentWolf 在
每份 board 快照中冻结所选变体;游戏引擎与生成目录保持为可执行的权威。

## 共享政策

- 普通淘汰保持 Role 身份隐藏,直到 Role 特定的公开揭示或 Match 结束。
- 标准警长 board 在首夜动作之后、死亡宣告之前进行警长竞选。候选人发言、可退选,原非候选人
  投票。一次平票进入 PK;第二次平票警徽流失。
- 存活的 Sheriff 拥有 1.5 倍投票权重,选择白天发言方向,并最后发言。当前的单次爆狼政策是:
  竞选爆狼阻止选举产生时警徽流失。
- 夜间遗言在启用时仅限首夜。
- Witch 每晚最多使用一种药水,不能自救。守卫与解药落在同一目标时结算为死亡。守卫可以自守,
  但不能在连续两晚保护同一名玩家。
- 首夜先由 Cupid 建立情侣关系,随后进入 Guard、普通 Werewolf 攻击、Witch 与查验类 Roles;
  后续夜晚从 Guard 开始。Ruleset 阶段图拥有确切顺序。
- 普通狼人攻击由每名有资格的狼队成员投一张私密票。`null` 表示明确的空刀,且仅在严格压过
  每个玩家目标票数时生效。玩家目标最高票平票时使用一次 Match 与夜晚内稳定的选择。

白天发言顺序使用已发出的、replay 稳定的选择。有存活 Sheriff 时,单一夜晚死亡以死者为锚点;
平安夜或多人死亡时以 Sheriff 为锚点。没有 Sheriff 时,单一死亡或最低 Seat 的多人死亡为锚点;
平安夜选择一个稳定的起点与方向。

## 已安装的特殊变体

Mirror Hidden board 包含两名狼队 Werewolf 与一名 Awakened Hidden Wolf。被隔离的 Role 与狼队
互不知情、可以互相指定为目标,且不共享狼人会议。Awakened Hidden Wolf 可学习一次,在注册的
时序下接收复制的能力,并在狼队被淘汰后获得自己的攻击。学习 Werewolf 授予一次双重攻击,其
同目标变体无视 Guard 与解药保护。

Magic Mirror Girl 收到确切的 Role 结果,且不能查验同一目标两次。White Wolf King 参与狼队
投票,但使用自己的定向白天自爆而非普通 Werewolf 自毁。由此产生的死亡进入共享的触发与胜负
管线。

Cupid 在首夜强制连接两名不同的存活玩家,可以自连。情侣只知道彼此,不知道对方 Role 或未自连
时的 Cupid;Cupid 不知道情侣 Role。情侣不能在放逐及放逐 PK 中互投,一方以任何原因出局时另一方
立即殉情。殉情不可阻止,不能触发殉情者的死亡能力,并继承原死亡的昼夜时点。

人人恋随好人胜负,狼狼恋随狼人胜负,均不改变原阵营终局阈值。人狼恋中的 Cupid 与情侣形成固定
第三方获胜集合;Cupid 存活或情侣共同存活时,普通阵营不能提前结束对局,圈外存活玩家清零后第三方
获胜。12 人预女猎爱场由四狼、四民、预言家、女巫、猎人和 Cupid 组成,采用上警屠边。

## 来源

- [官方角色、板子、胜负与遗言规则](https://langrensha.com/wanfa/guize/2017/10/18/26899_719311.html)
- [官方首日警长流程](https://www.taptap.cn/moment/658304304670575860)
- [警长平票与打断变体](https://zh.wikiversity.org/zh-cn/%E7%8B%BC%E4%BA%BA%E6%AE%BA/%E9%81%8A%E6%88%B2%E8%A7%92%E8%89%B2/%E8%AD%A6%E9%95%B7)
- [Werewolves of Miller's Hollow 规则书](https://www.gokids.com.tw/tsaiss/gokids/rules/BestOf_EN_CH%20rules.pdf)
- [Awakened Hidden Wolf 板子与查验行为](https://shouyou.gamersky.com/news/202409/1811620.shtml)
- [Awakened Hidden Wolf 复制能力](https://langrensha.net/news/20240905-5.html)
- [官方丘比特板子与胜负规则](https://www.taptap.cn/moment/15208420701372848)
