# Agent Note: 身份牌池、底牌与盗贼身份转换

Status: implemented

## Problem

带底牌的 board 需要把完整身份牌池与实际玩家席位分开,并让 Role plugin 约束合法发牌组合。盗贼
选择又会立即改变玩家的阵营知识、能力授权、首夜 actor、查验、死亡技能与胜负。底牌和身份转换
必须成为可恢复的规则事实,同时不能向无关玩家或闭眼视角泄露。

## Decision

Board 的 `roles` 描述完整身份牌池,`playerCount` 等于牌池数量减去 `reserveCount`。自定义 board
支持零至两张底牌;Match 的随机和手动创建都从同一冻结牌池产生 Seat assignments 与 reserve Roles。
每张底牌拥有稳定 Role Card ID,实际 deal 以 god-visible 事件写入 GameState。

Ruleset 持有 plugin-owned deal validator registry。通用发牌器负责稳定卡牌 ID、确定性选择与
multiset 校验;Role plugin 注册 board 要求和候选组合约束。随机发牌只从全部 validator 接受的组合中
选择,手动发牌经过同一校验。

夜间动作使用独立 `roleCardId` 表达身份牌选择,并继续通过 `submit_night_action` 暴露。当前 action
expectation 将可选 Role Card IDs 收窄为 MCP schema enum,Player targets 与 Role Card choice 保持两个
正式字段。

Role 转换由核心事件原子替换 Player Role/Faction 并清空旧 Role state,随后重新发布有资格玩家的
Faction 名册。Phase selectors、capabilities、queries、death triggers 与 victory 读取转换后的当前
Role。Role plugin event 独立保存选择 provenance、私有呈现和终局揭晓。

当前 Thief plugin 在首夜 Cupid 之前行动。Thief 可能成为底牌而不在场;在场时必须从两张底牌中
选择最终 Role,底牌含 Werewolf Faction Role 时只能选择该牌。发牌约束保证全部狼人牌在选择后入场。
转换后的 Role 在同一夜立即参加后续阶段。底牌与选择在运行期间仅上帝和 Thief 可见,终局最终身份
公开后向所有视角揭晓。

`classic` 当前执行 revision 为 7,Match board snapshot 使用 schema 4。终局历史继续由冻结 archive
读取,生产运行时只安装当前 revision。

## Alternatives considered

**把底牌编码进 `option` 字符串。** MCP schema、simulation 与审计无法枚举或解析正式卡牌选择。

**只为内置盗丘 board 特判发牌。** 具体 Role 语义会进入通用初始化路径,自定义 board 中安装的
Thief 也无法正确执行。

**保留 Thief Role 并动态授予所选能力。** Faction、阵营知识、查验、Role phase、死亡 trigger 与
胜负仍会读取错误的基础身份。

**为旧 revision 保留兼容 runtime。** 这会反转单 current Ruleset 与只读 archive 的既有边界。

## Consequences

- Board、Match setup、Prompt facts、MCP、simulation 和 Web 配置共享同一身份牌池/底牌词汇。
- 新的牌池 Role 通过 deal registry 与 Role Card choices 扩展,无需修改通用发牌分支。
- 动态 Role 的后续行为由现有 registries 自动获得,但 plugin 必须显式拥有 provenance、可见性与终局
  呈现。
- 手动 Match 配置同时拥有 Seat 和底牌卡槽;二者共同匹配 board 牌池。
- Ruleset plugin 集合或 deal/转换语义变化需要新的整数 revision;非当前 revision Match 没有执行入口。

## Verification

规则、发牌、Role 转换、恢复、Prompt、MCP schema、ActionMailbox、projection、终局 archive、SQLite
迁移、自定义 board、Web 与 Playwright 测试共同验证该决策。活动仿真 corpus 通过 engine 与生产
MatchRuntime 双 runner 覆盖普通终局、暂停边界和 Thief-to-Cupid 终局;真实隔离 ACP smoke 验证
`roleCardId` 工具提交。
