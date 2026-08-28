# 游戏运行时架构

## 职责

游戏运行时将冻结的 board 与有序的玩家动作转化为一个 append-only 的确定性事件流。它拥有
Ruleset 组合、游戏状态归约、阶段推进、动作校验、效果结算、interrupts、胜负判定与 replay。

[`packages/game-engine`](../../packages/game-engine/README.md) 实现该模块。它不执行任何文件
系统、数据库、网络、进程、Prompt 或浏览器 IO。

## 边界

- Contracts 提供 branded IDs 与事件/动作 schemas。
- server 选择版本化 Ruleset、提供 actions 并持久化已发出的事件。
- Assets 与 server 呈现已过滤的游戏语义;引擎不拥有任何行文或视觉指令。
- Roles、阵营知情、动作能力与呈现可见性是相互独立的概念。

内核中不含任何具体的 Role、Ability、Phase 或 Plugin ID。具体规则只通过已安装插件和经校验的
board 配置进入。

## Ruleset 组合

`RulesetBuilder` 安装一份有序的插件清单并冻结 `RulesetRuntime`。安装作用域记录每个 Role、
Ability、Phase、插件事件、query、trigger、interrupt、结算 handler 与胜负评估器由哪个插件
贡献。重复或无主的注册在构建时失败。

当前目录安装 `classic-v3`。历史 `classic-v1` 与 `classic-v2` 运行时保持可用,仅供指名其确切
锁版本的快照使用。schema-two 的 Match 快照存储 Ruleset ID/版本、有序插件 ID 与版本、配置
哈希、规范指纹以及解析后的 board 政策。Restore 拒绝不匹配的已安装指纹。

## 阶段与动作流

Phase 插件向一张经校验的图贡献函数所有的节点与有序插入。每个交互节点声明:

- 动作类型与行为者选择;
- 公开、行为者私密、阵营或上帝可见性;
- 所需能力或允许的 abilities;
- 顺序或并行收集模式;
- trigger 与 interrupt 窗口;
- 确定性的出边。

定稿的图具有一个入口、唯一可达节点、有效边目标、确定性顺序和有界延续。运行时代码向活跃
节点询问行为者与预期,而不是从 phase ID 推断行为。

动作校验器在引擎变化之前检查行为者、阶段、目标 IDs、基数、能力、Role 状态与单次提交规则。
被拒绝的动作不产生事件,并保持预期开放以便修正。

## 结算

被接受的动作成为不可变 intent。效果定义选择一条命名 lane:targeting、prevention、protection、
damage、information、death、reaction、announcement 或 victory。队列按 lane、定义顺序与入队
顺序排列效果。

Handler 可以追加更多效果。结算在周期上限内持续到静息。Finalizer 合并死亡、营救、查验、持久
能力使用以及其他插件所有的结果。交互式死亡反应在最终胜负评估之前成为 trigger 选择的技能
阶段。

能力(capability)同时授权原生与动态授予的 abilities。普通狼人攻击等共享机制只定义一次;
Role 插件授予或撤销能力,而不是复制该机制或在内核中分支。

## 事件、可见性与 replay

每个状态变化都由一个携带 match 内序列号与可见性描述符的领域事件表示。Reducer 从事件日志
重建核心与插件状态。可见性过滤是纯函数,发生在 server 序列化或 Prompt 渲染之前。

Replay 从同一冻结 board 与 Ruleset 指纹出发,按序重放事件,并到达相同状态。稳定的 Match 派生
选择作为事件发出,因此后续 replay 从不依赖进程随机性。

## 扩展契约

新的可玩 Role 通过一个 Role 插件和配套资产贡献其语义。它可以注册能力、abilities、phases、
事件 reducer、效果、queries、triggers、interrupts 或胜负行为。共享结算与内核不新增
Role-ID 分支。

[Role 开发 Skill](../../.agents/skills/agentwolf-role-development/SKILL.md) 拥有跨层实现工作流。
[游戏目录](../generated/game-catalog.md)从 Role 所有的清单与 board 文案生成,不在此处维护。
