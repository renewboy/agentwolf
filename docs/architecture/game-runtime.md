# 游戏运行时架构

本文描述 AgentWolf 如何把冻结的 board、版本化 Ruleset 与玩家动作转换为可确定重放的事件流。
目标读者是修改规则插件、phase 图、动作校验、effect 结算、胜负或 replay 的研发人员。Agent 回合
编排、Prompt 呈现、持久化和浏览器投影位于运行时之外。

## 设计目标与边界

游戏运行时需要同时保证：

- 相同冻结配置、稳定 seed/clock 和动作顺序得到相同事件语义、状态和胜负；
- 提前终局只使用候选阵营实际可见的事实,隐藏身份不能成为其策略输入；
- 具体 Role 与规则变体通过插件组合，通用内核保持语义中立；
- 每次状态变化都能由事件解释并重建；
- 动作在改变状态前完成 actor、phase、能力、目标和次数校验；
- 多个能力通过统一 effect 管线结算，不在中央代码中建立 Role 分支；
- 身份牌池、底牌和运行中 Role 转换保持确定性并可由事件恢复；
- 事件携带可见性，但 IO 层负责针对实际观看者进行最终过滤。

[`packages/game-engine`](../../packages/game-engine/README.md) 依赖 AgentWolf contracts、Zod 与固定
Core revision 的 Ruleset/确定性运行时入口。它执行无 IO 的纯规则计算。server 选择 Ruleset、提供
动作、保存事件并处理外部生命周期。

## 运行时组件

下图显示 Ruleset 组合、GameEngine 控制循环与事件归约之间的关系。registries 是插件向内核贡献
行为的稳定接口；事件日志是 GameState 的唯一变化来源。

```mermaid
flowchart LR
    Board["BoardManifest<br/>牌池、底牌、人数、政策"]
    Plugins["有序 RulePlugin 集合"]
    Core["Agent Arena Core<br/>loader、ownership、graph、resolution、lock"]
    Builder["RulesetBuilder<br/>依赖与所有权校验"]

    subgraph Runtime["冻结的 RulesetRuntime"]
        Roles["Role / Ability / Capability"]
        Phases["Phase graph 与 RuleRegistry"]
        Resolution["Effect / Query / Finalizer"]
        Signals["Event / Trigger / Interrupt / Victory / Endgame"]
    end

    Engine["GameEngine<br/>action boundary 与事件追加"]
    Log["append-only GameEvent[]"]
    Reducer["reduceGameEvent"]
    State["GameState"]

    Plugins --> Builder
    Core --> Builder
    Builder --> Runtime
    Board --> Engine
    Runtime --> Engine
    State --> Engine
    Engine --> Log
    Log --> Reducer
    Reducer --> State
```

| 组件                  | 拥有的决策或状态                                                                                                                     | 输入与产出                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Agent Arena Core      | plugin 拓扑安装、semantic ownership、组合图、query/resolution 算法、Ruleset lock 与确定性选择                                        | 通用 plugin/registry contracts → 可复用基础机制           |
| `AgentWolfGameModule` | 将现有 state/action/event/visibility/turn 映射为 Core GameModule、observation 与 decision boundary                                   | 产品事件与状态 → Core Match runtime contract              |
| `RulesetBuilder`      | plugin 安装顺序、依赖、配置 schema 与语义所有权                                                                                      | RulePlugin 列表 → 冻结 `RulesetRuntime`                   |
| registries            | Role/Ability、actor selector、action validator、phase handler、effect、query、trigger、interrupt、plugin event 与 victory 的唯一注册 | plugin 贡献 → 可按契约查询的行为集合                      |
| `PhaseGraphRegistry`  | phase 节点、循环入口和有序插入，保证返回边、引用与可达性有效                                                                         | plugin nodes/insertions → `PhaseGraph`                    |
| deal registry         | plugin-owned 牌池约束、合法底牌组合与转换前置条件                                                                                    | board + Role cards → 合法 deal                            |
| `GameEngine`          | 当前 action boundary、事件序列与派生 GameState                                                                                       | board、Ruleset、动作 → 新事件与下一 `TurnDescriptor`      |
| action validator      | 当前 actor、动作类型、能力、目标、基数、使用次数与 Role 自定义规则                                                                   | `PhaseNode` + GameState + action → 接受或 `RuleViolation` |
| `ResolutionRegistry`  | effect lane、同 lane 顺序、动态入队与 finalizer 合并                                                                                 | abilities 产生的 effects → `ResolutionResult`             |
| plugin event registry | typed plugin state 的 schema 与 reducer                                                                                              | `plugin.event` → plugin state 分片                        |
| victory registry      | 基础 evaluator 的一致性、有序 modifier 与明确获胜 Player IDs                                                                         | 终局上下文 → 唯一 victory candidate                       |
| endgame registry      | Role 物质语义完整性、狼队 belief states 与确定性必胜证明                                                                             | 可见事件 + board + Role 模型 → 可选狼人终局候选           |
| event reducer         | 从领域事件重建所有核心与 plugin 状态                                                                                                 | 旧 GameState + GameEvent → 新 GameState                   |

## Ruleset 组合与锁定

每个 `RulePlugin` 声明 ID、版本、可选依赖和可选配置。Core 安装器验证重复 ID、依赖版本、依赖环和
配置 schema,再按拓扑顺序进入 plugin install scope。AgentWolf semantic adapter 将 Role、Ability、
Phase、plugin event、query 与 trigger 记录为该 plugin 的贡献;跨 plugin 冒领或重复注册在构建时失败。

`RulesetRuntime` 冻结以下协作面：

- Role/Ability/capability registry；
- actor selectors、predicates 与 phase completion handlers；
- phase graph；
- resolution effects 与 finalizers；
- query definitions/modifiers；
- decision triggers 与 interrupts；
- Role-card deal validators；
- plugin event reducers；
- victory evaluators；
- 有序 plugin 元数据和 semantic contributions。

server 的 Ruleset catalog 是声明表。每个规则族声明稳定 family ID、当前 revision、默认标记与 runtime
factory;表中恰好有一个默认规则族。game-engine 通过 Core lock helper 为 Match snapshot 生成
revision、有序 plugin lock、规范化配置哈希和整体 fingerprint。只有与表中当前 revision 和 fingerprint
完全一致的 snapshot 可以建立可执行 runtime,其他 revision 没有 factory。board 的 phase 图始终来自
该 runtime。

## 身份牌池、底牌与 Role 转换

Board 的 Role slots 描述完整身份牌池。`playerCount` 等于身份牌数量减去 `reserveCount`;Match 创建时
为每张牌分配稳定 Role Card ID,由确定性发牌器选择底牌并把其余卡牌分配给按 Seat 排序的玩家。
手动分配同时提交 Seat Roles 与底牌 Roles,两者的 multiset 必须与冻结牌池完全一致。

下图说明 Role plugin 如何约束发牌而不进入通用初始化分支。

```mermaid
flowchart LR
    Pool["冻结身份牌池"] --> Cards["稳定 Role Card IDs"]
    Cards --> Candidates["底牌候选"]
    Plugins["plugin deal validators"] --> Candidates
    Candidates --> Deal["assignments + reserves"]
    Deal --> Assign["role.assigned"]
    Deal --> Reserve["role.cards-reserved"]
    Assign --> State["GameState"]
    Reserve --> State
    State --> Choice["已校验 roleCardId action"]
    Choice --> Transform["role.transformed"]
    Transform --> State
```

Deal registry 先验证 board 级要求,再验证每个候选组合。随机发牌只从合法组合中确定性选择;不存在
合法组合时 Match 在创建前失败。底牌以 god-visible 事件进入 GameState,使 restore 和 simulation
直接重放已经发生的 deal,不重新抽牌。

需要改变身份的 Role 通过正式 Role Card choice 声明可选项。动作仍经过当前 phase、ability、actor 与
plugin 校验;转换事件原子替换 Role/Faction 并清空旧 Role state,随后重新发布有资格玩家的阵营名册。
Phase actor selector、capability、query、死亡 trigger 与 victory 从转换后的当前 Role 读取,因此同一夜
后续阶段立即看到最终身份。Role plugin event 独立保存选择 provenance 与可见性安全的叙述事实。

## Phase 图与 action boundary

`PhaseNode` 把控制流和动作契约放在一起。一个节点声明：

- `automatic`、`parallel` 或 `sequential` 模式；
- action 类型、可见性、允许的 ability/capability 或 Sheriff action；
- actor selector 和可选 active predicate；
- public、actors 或 god 的阶段呈现；
- 可选 interrupts；
- 带 predicate 的有序出边和 fallback 出边。

Ruleset 构建时验证入口、边目标、插入关系和可达性。运行时进入节点时先跳过 active predicate 为
假的节点，并为交互节点通过 selector 冻结 actor 集。`GameEngine.#drive` 连续执行 automatic 节点，
直到交互 action boundary、终局或无出边；循环有明确上限，错误图不会无限推进。

`currentTurn` 从当前节点直接导出 `TurnDescriptor`，包括 actors、动作类型、允许 abilities、动态
decision-trigger abilities、pass 许可和 interrupts。包裹循环入口的 phase insertion 同时重写返回旧入口
的边，使首夜阶段与后续夜晚共享一条循环边界。server 不需要根据 phase ID 猜测动作语义。

Phase interrupt 的资格独立于主 action actor 集。引擎按当前节点声明的 interrupt capabilities 查询
任意存活玩家的合法 ability；普通 action 仍受冻结 actors 与 sequential 首 actor 约束。server 可以
据此并行开放后台 listener,但只有通过同一 action gateway 的 interrupt 才能改变规则状态。

## 动作提交与阶段推进

下图说明一个动作如何从未可信输入变成事件，并在 phase 完成后继续控制流。

```mermaid
sequenceDiagram
    participant Server as MatchRuntime
    participant Engine as GameEngine
    participant Validator as Action Validator
    participant Registry as Role / Trigger Registries
    participant Reducer as Event Reducer

    Server->>Engine: validateAction(action)
    Engine->>Validator: 当前 PhaseNode + actor + state
    Validator->>Registry: ability、capability、target 与 Role 校验
    Registry-->>Validator: 合法或 RuleViolation
    Validator-->>Server: 可接受

    Server->>Engine: submit(action)
    Engine->>Engine: normalize + action visibility
    Engine->>Reducer: append action.submitted
    Reducer-->>Engine: 新 GameState
    Engine->>Reducer: append outcome + actor-completed
    Reducer-->>Engine: completedActors 更新
    Engine->>Engine: phase complete 时运行 handler 与出边
    Engine-->>Server: 新事件 + 下一 action boundary
```

校验按以下层次进行：

1. Match 必须处于 running；普通 action actor 必须属于当前冻结 actor 集且尚未完成，interrupt actor
   必须存活并拥有节点声明的 capability；
2. sequential 节点只接受当前首个 actor；
3. action type 与 `PhaseNode.action` 对齐；
4. ability/capability、Player/Role Card 目标、目标数量、pass 语义和次数限制通过 Role registry 校验；
5. plugin 注册的有序 action validators 对关系或规则组合贡献额外纯校验；
6. decision trigger 或 interrupt 还需通过其声明的 signal、context 与 handler 契约。

拒绝动作不追加事件、不改变 `completedActors`、不推进 phase。接受动作先规范化并发出
`action.submitted`，随后把动作的稳定结果表示成更多事件，最后发出 god-visible 的
`phase.actor-completed`。sequential 节点宣布下一位 speech actor；parallel 节点只在所有 actor
完成后进入 completion handler。server 可以对顺序发言使用 deferred continuation，在外部播报边界
释放后再调用 `continueAfterDeferredAction`，但 phase 语义仍由引擎持有。

GameModule adapter 从 phase ID、最后一条非 delivery 领域事件 sequence 与当前 actors 派生稳定 decision
ID，因此 Prompt delivery 记录不会改变 active boundary。普通非发言 action batch 经 Core gateway 密封后
按 actor 顺序提交；发言、rolling interrupt 和 playback 由 server 产品执行器继续控制。

## Ability 与 effect 结算

Role registry 将 Ability 定义与其 Role、允许 action types、校验、effects 和 outcomes 关联。
capability 允许多个 Role 共享同一机制，也允许插件动态授予或撤销能力，而无需复制机制或把 Role
身份写入内核。

effect 结算分为“产生意图”和“归并结果”两步：

```mermaid
flowchart LR
    Actions["已校验 actions"] --> Abilities["Ability.effects"]
    Abilities --> Queue["ResolutionAgenda"]
    Queue --> Targeting["targeting"]
    Targeting --> Prevention["prevention"]
    Prevention --> Protection["protection"]
    Protection --> Damage["damage"]
    Damage --> Information["information"]
    Information --> Death["death"]
    Death --> Reaction["reaction"]
    Reaction --> Announcement["announcement"]
    Announcement --> Victory["victory"]
    Victory --> Finalizers["ordered finalizers"]
    Finalizers --> Result["deaths、saved、inspections、usage"]
```

每个 effect kind 有 schema、lane 和可选的同 lane `before/after` 约束。registry 对定义做拓扑排序，
再按 lane、定义顺序和入队顺序执行；handler 可以向同一 frame 追加 effects。队列和 phase drive 都有
有界步数，未知 effect、跨 lane 排序或依赖环会失败。finalizers 按稳定顺序读取 frame facts，将死亡、
营救、查验和 ability 消耗等贡献合并成 `ResolutionResult`。

Ability outcomes 再把结算结果转换为带 visibility 的领域事件。自动死亡 trigger 在一个有界批次中
展开并去重连锁死亡，继承原死亡的昼夜时点，并可以声明使用通用淘汰公告或仅使用其事件呈现。夜间
批次由统一死亡名单公开，自动反应的公开细节降为 god 可见；逐人结算可以用无旁白的公开淘汰事实
更新外部生存状态，并由 plugin event 承担专属旁白。夜间 Ability 的声明阶段决定它参与狼刀正式
胜负检查还是仅在检查未结束 Match 时执行；交互式死亡 trigger 只在没有狼刀胜负锁时开放。

正式胜负、狼人必胜证明、死亡技能、终局遗言、Sheriff 与 `match.ended` 的完整优先级由
[游戏结算与终局](game-settlement.md)拥有。普通路径在交互式反应稳定后接受胜负候选；狼刀路径在
前置保护、狼刀死亡与自动死亡链稳定后允许锁定狼人正式候选。两条路径都在有资格的终局遗言完成后
进入 terminal phase。

## 事件、状态与 replay

`GameEngine` 通过唯一 append 函数生成事件：分配 Match 内递增 sequence、时间、visibility 和 payload，
验证 plugin event schema，然后立即调用 reducer。核心 reducer 负责 Match、phase、玩家、Role cards/
转换、Sheriff、
死亡、投票、能力、capability 和终局状态；plugin event registry 负责各插件的 `pluginState` 分片。

事件可见性有 public、god、players 和 faction 四类。死亡事实记录原因与昼夜时点，终局事实记录
Faction 与明确获胜 Player IDs。引擎决定事件事实和初始可见性；server 结合观看者
身份、公开淘汰、Role reveal 和 phase presentation 构造最终视图。精确投影规则属于
[信息同步架构](information-synchronization.md)。

可执行 Match 的恢复和 replay 从空状态开始顺序归约事件，并使用当前 snapshot lock 解释 plugin
events。GameEngine restore 只额外应用持久 Match status 与 paused reason；它不读取当前目录、
trajectory 或浏览器状态。完成赛后流程的 Match 使用规则无关的冻结投影读取，不再进入 GameEngine，
详见[Match 生命周期](match-lifecycle.md)。会影响重放的随机选择在 Match 初始化或规则执行时被确定并
以事件/稳定算法固定。

## 扩展边界

- 新 Role 通过 Role plugin 注册 Role、abilities、capabilities、专属 phases、events、effects、queries、
  action validators、triggers、interrupts 或 victory modifier；跨层实现使用
  [Role 开发 Skill](../../.agents/skills/agentwolf-role-development/SKILL.md)。
- 每个 Role 显式声明 `endgameModel`;每个 ability 声明 `endgameImpact`。material ability 由同一
  Role plugin 注册完整 endgame 模型,信息型或被动行为也必须显式分类。
- 加入夜间 batch 的 ability 声明 `nightResolutionStage`;所有 `nightAttack` 必须属于
  `wolf-priority`,后序能力属于 `post-wolf-priority`。
- 新共享机制进入最窄 registry；只在多个插件需要同一契约时扩展通用类型。
- 新牌池约束通过 deal registry 注册；board/server 不按具体 Role ID 选择发牌算法。
- 新 phase 行为通过节点声明、selector、predicate 和 handler 表达，server 与 action validator 不添加
  phase ID 推断。
- 新持久 Role 状态必须由 plugin event schema/reducer 重建；进程内缓存不能成为规则事实。
- 新结果呈现通过事件与 visibility 进入 Prompt/projector 资产，不把文案、动画或 Character 语义写入
  engine。

## 故障与验证边界

- plugin 版本、依赖、配置、语义所有权或 phase 图非法时，Ruleset 构建失败。
- Role 缺少 endgame 声明、material ability 未被模型覆盖、夜间阶段缺失或模型引用未知 Role 时,
  Ruleset 构建失败。
- snapshot revision 不是当前值或 fingerprint 不匹配时，server 拒绝执行该 Match。
- 输入 schema、actor、phase、ability 或目标非法时，动作在任何事件产生前失败。
- 未知 effect、effect 顺序环、队列超限、phase drive 超限或冲突 victory candidates 作为规则错误上抛，
  MatchRuntime 在应用边界暂停 Match。
- 单元与 property 测试覆盖 registry、phase、动作、结算、visibility、胜负和 replay；跨层 Session、
  Prompt、持久化与浏览器行为由相应模块测试负责。

## 架构不变量

- GameState 的规则变化只来自已校验并按序追加的 GameEvent。
- Seat assignments、底牌与 Role 转换都由事件固定,restore 不重新发牌或推断最终身份。
- 通用内核不包含具体 Role、Ability、Phase 或 Plugin ID 分支。
- PhaseNode 是 actor、action、visibility、interrupt 和控制流的语义来源。
- 自动死亡反应先形成稳定死亡批次；狼刀胜负锁关闭该批次后的交互式死亡技能窗口。
- 正式胜负优先于狼人必胜证明;第三方和 Village 不产生提前终局候选。
- Ability 产生 effects，ResolutionRegistry 结算共享交互，Role plugin 产生其 outcomes。
- 只有 Catalog 表中的当前 Ruleset revision 具有执行能力；终局历史由只读 archive 承载。
- 引擎只声明 visibility；server projection 才是外部消费者的保密边界。
- Ruleset、board、事件和动作顺序相同时，replay 到达相同状态和终局。

## 深入阅读

- [系统架构](../architecture.md)：跨包依赖与端到端 Match 链路。
- [Prompt 与玩家上下文](prompt-and-context.md)：plugin semantic contribution 如何约束 Prompt bundle。
- [信息同步](information-synchronization.md)：event/phase visibility、barrier 与外部投影。
- [Match 生命周期](match-lifecycle.md)：Ruleset snapshot、事件持久化和恢复。
- [游戏结算与终局](game-settlement.md):正式胜负、狼人必胜证明与终局事件顺序。
- [游戏规则基线](../reference/game-rules.md)：当前 board 政策与规则定义。
- [游戏目录](../generated/game-catalog.md)：由源码生成的 Roles、boards 与 Prompt 清单。
- [Agent Arena Core 架构](../../vendor/agent-arena-core/docs/architecture.md)：Ruleset、decision、event 与
  simulation 基础机制。
