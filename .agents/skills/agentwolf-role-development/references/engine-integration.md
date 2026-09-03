# 引擎集成

新增 Role 或任何 Role 语义变更时使用本参考。编辑前用 `rg` 确认确切路径;下方的归属边界才是
稳定契约。

## 1. 建模 Role 契约

使用 `@agentwolf/contracts` 中的 branded ID:

- Role 用 `role-<slug>`;
- 其 Rule plugin 与配套 Prompt bundle 用 `plugin-role-<slug>`;
- 提交的 ability 用 `ability-<slug>-<action>`;
- 跨 Role 共享或动态授予的授权用 `capability-<semantic-action>`;
- Role 专属阶段用 `phase-<semantic-stage>`;
- Role 专属 plugin event 用 `event-<semantic-result>`;
- 仅当行为需要那些 registry 时才使用 `query-...` 与 `trigger-...`。

当前经典 ID 的归属处是
`packages/game-engine/src/rulesets/classic/capabilities.ts` 与
`packages/game-engine/src/rulesets/classic/plugins/ids.ts`。新常量与其语义归属放在一起,只从
`packages/game-engine/src/index.ts` 暴露 server 代码或测试真正消费的 Role ID 或 ability
helper。

Role 类继承 `packages/game-engine/src/roles/base.ts` 并声明:

- `id`、`displayNameKey`、`faction` 与 `kind`;
- `endgameModel`,明确该 Role 是终局无物质影响还是由 plugin 提供模型;
- 仅当该阵营的每个成员都应收到阵营名册时声明 `sharesFactionKnowledge`;
- 静态 `capabilities`;
- `abilities`,其中每个 ability 声明其 ID、`endgameImpact`、可选的 required capability、接受的
  action 类型、纯校验、结算效果与可选的事件结果;加入夜间 batch 时还声明
  `nightResolutionStage`。

ability 的 `validate` 函数在不改变状态的前提下拒绝非法动作形状、目标、时机、先前使用与
board 策略。其 `effects` 函数发出语义结算效果。其 `outcomes` 函数把已结算结果转译为可见或
私有领域事件。引擎记录 `ability.used`;使用上限用 `abilityUseCount`。

优先使用 capability 检查而非 Role 检查。共享 ability 以 `requiredCapability` 注册一次;
`RoleRegistry` 使其可用于每个拥有该 capability 的 Role 或动态授予的玩家。阶段 actor 选择使用
`capability-alive:<id>`,阶段激活使用 `capability-active:<id>`。

玩家动作面是 `packages/contracts/src/actions.ts` 中的封闭集合:发言、投票、夜晚动作、
Sheriff 动作与 Skill 触发,通过七个 MCP 工具暴露。使用语义匹配的既有形状。如果没有一个形状
能在不把结构隐藏进 `option` 字符串的情况下表达该 Role,则把这项工作视为协议变更,并一起
更新 contracts、阶段动作类型、校验、MCP transport、`_core` 工具呈现、provider 策略与集成
测试。

## 2. 注册一个内聚的 Rule plugin

当前经典组合位于
`packages/game-engine/src/rulesets/classic/plugins`。把 Role plugin ID 加入 plugin ID 归属处,在
`rulesets/classic/roles` 中实现该 Role,并为该 Role 导出一个 `RulePlugin<RulesetBuilder>`。把该
plugin 接入目标版本化 Ruleset manifest。把 Role 专属分支保留在 Role plugin 内,而不是向内核
或通用编排代码添加 Role-ID switch。

只注册该 Role 需要的扩展点:

| 需求               | Registry 或归属者                                  | 当前示例                                   |
| ------------------ | -------------------------------------------------- | ------------------------------------------ |
| Role 与 ability    | `roles.register`                                   | 每个 Role plugin                           |
| 自有动作阶段       | `phases.insert` 或 `phases.register`               | Seer、Guard、Magic Mirror Girl             |
| 阶段完成行为       | `rules.registerPhaseHandler`                       | Idiot 与功能性阶段 plugin                  |
| 持久 Role 事件状态 | `events.register`                                  | Magic Mirror Girl、White Wolf King         |
| 新结算操作         | `resolution.registerEffect` 与可选 finalizer       | synthetic plugin runtime test              |
| 身份或派生结果     | `queries.register` / `registerModifier`            | classic identity queries                   |
| 交互式反应         | `triggers.registerDecision`                        | Hunter                                     |
| 公开阶段 interrupt | 阶段 interrupt capability 加 `interrupts.register` | Werewolf、White Wolf King                  |
| 替代胜利条件       | `victories.register`                               | classic victory 与 synthetic plugin test   |
| 狼人必胜影响       | `endgames.registerRole`                            | Witch、Hunter、Cupid、Awakened Hidden Wolf |

每个 plugin config 都有严格 Zod schema。当 plugin 需要另一个已注册语义契约时,以 plugin ID 与
版本声明依赖。安装顺序是确定性的,语义归属会在 plugin install scope 内自动记录。

### Endgame 模型

`none` 与 `information` ability 不直接改变存活、票权、资源、关系或正式赢家。`material` ability
必须进入 Role plugin 的 endgame 模型。模型描述狼队协作方式、可造成的淘汰、保护、死亡反应、
放逐免疫、关系约束或 Role 转换,并覆盖该 Role 的全部 material ability IDs。

plugin endgame model 必须声明 `knowledgeAbilityIds`。狼人 Role 的 information ability 全部进入该
集合;同时改变能力并提供身份知识的 material ability 同时进入 material 与 knowledge 集合。模型的
观察器从获授权事件返回 observer、目标 Player ID、Role 与事件序号,不得读取 God-only 当前 Role
伪造控制组知识。普通狼队和隔离狼的观察分别贡献,不能跨组共享。

`wolf-priority` 夜间 ability 参与保护、狼刀死亡、自动死亡链和正式狼人胜负检查。该检查锁定胜利
后,`post-wolf-priority` ability 不消费资源也不产生 outcome。新增夜间 ability 必须按这一可观察
时序分类;Ruleset 构建会拒绝漏分类和放入后置阶段的 `nightAttack`。

模型只提供有限、确定性的规则语义。狼人必胜求解器为每个控制组从可见事件构造观察,以 Player ID
为键展开当前 board 牌池中的兼容身份世界;同一 belief 中的行动必须选择所有世界都合法的同一
Player ID。新增信息只能收窄观察者所属控制组的 belief。若一种行为尚不能安全建模,应让证明返回
无候选,不能用乐观默认值继续。

### Role 专属阶段

Role 专属的交互式 `PhaseNode` 声明其动作类型、可见性、capability 或 ability 要求、actor 选择
器、激活谓词与插入点。动作契约是权威的;不要从阶段 ID 推断行为。保持并行 barrier 语义,仅
当每个较早的动作必须对下一个 actor 可见时才使用顺序阶段。

当 Role 可以 interrupt 既有公开阶段时,把它的 capability 加入归属功能性阶段的 interrupt 窗口。
功能性阶段拥有 interrupt 何时合法;Role plugin 拥有该 capability 与 ability。不要针对 Role ID
做测试。

### 效果与结算

只有当语义与交互规则完全一致时才复用已注册效果。对于新行为,在 Role plugin 中定义
`ExtensibleResolutionEffect`、严格 schema、命名 lane 与 apply handler。对聚合结果使用 frame
facts 与 finalizer。lane 内排序使用声明的依赖与稳定注册顺序;跨 lane 顺序遵循固定的结算 lane
序列。所有入队都是有界的。

当后续反应或胜负需要观察死亡时,通过公共伤害/死亡/trigger 管线发送死亡。当 Role 可能造成多
重死亡、防止、转移或死亡触发 ability 时,显式测试排序。

### 事件溯源的 Role 状态

新的 Role 专属持久状态使用带以下要素的 plugin event:

- 一个 schema 版本;
- 严格的状态与数据 schema;
- 一个初始状态;
- 一个确定性 reducer。

从 ability outcome 或归属阶段 handler 发出 plugin event,并带上其确切可见性。之后的校验从
`GameState.pluginState` 读取重建状态。不要向通用 reducer 添加新的 Role 专属记忆变更。添加一
个 restore 测试,从事件重建引擎并证明状态仍然控制合法性。

## 3. 组合 board 与 Ruleset

`BoardCatalogService.listRoles()` 从当前 `RoleRegistry` 发现已安装 Role,因此新 Role 在安装后
自动可用于自定义 board 组合。内置 board 仍需要:

- `packages/game-engine/src/rulesets/classic/boards.ts` 中的 `BoardManifest` 组合;
- server 内置 board 条目及本地化名称/描述;
- 导出与 catalog 测试;
- 其组合的浏览器覆盖。

验证既有 `BoardPolicies` 能否表达该 Role 的可配置规则。新 policy 是一次 wire 与快照变更:一起
更新 contracts、manifest 构造、Prompt facts、适用的配置 UI、restore 测试与归属架构契约。

### Ruleset 兼容性

有序的已安装 plugin、其版本与校验过的配置构成 Ruleset 指纹。Ruleset family 保持稳定,语义变化
通过整数 revision 建立新的执行边界。

当安装新 Role plugin 或变更 plugin 版本/配置时:

1. 确认先前 revision 的终局 Match 已生成 archive,非终局 Match 已由操作者结束或删除;
2. 递增当前 revision,更新 manifest 与 release table 中唯一可执行的 factory;
3. 保持唯一 Match snapshot schema,由 lock revision 与 fingerprint 拒绝过期执行;
4. 为新 revision 生成当前仿真语料,活动 corpus 不保留历史 Ruleset;
5. 证明 archived Match 的查看与 audit 不调用 GameEngine 或 RulesetCatalog。

仿真、轨迹审计、Match 恢复与 Prompt 组合对未归档 Match 使用同一条当前 `RulesetCatalog` 路径。
历史 Match 只消费冻结 archive,不安装兼容 runtime。

## 4. 引擎验证目标

至少覆盖:

- 合法动作、每个有意义的非法目标/时机/使用用例,以及 pass 行为;
- capability 授权及其对无关 Role 的缺席;
- 精确的阶段插入与 actor 选择;
- 效果排序与全部交互策略;
- 事件载荷、可见性、reducer 状态与恢复;
- 存在时的 trigger/interrupt/victory 排序;
- endgame material/information 覆盖、控制组私有观察、隐藏身份分歧、统一 Player ID 策略、对手
  反制与无证明路径;
- 相同种子与动作序列下的确定性 replay。

以 `packages/game-engine/tests/plugin-runtime.test.ts` 作为扩展无需内核改动的证明,以
`plugin-roles.test.ts` 作为复杂生产 Role 的集成风格。
