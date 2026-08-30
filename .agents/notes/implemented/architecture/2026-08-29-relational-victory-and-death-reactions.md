# Agent Note: 关系型胜负与死亡反应

Status: implemented

## Problem

玩家之间的私有关系会同时影响动作合法性、连锁死亡和获胜资格。共享运行时需要承载这类组合规则，
同时保持具体 Role 语义由 plugin 持有，并让事件日志能够重建关系、死亡时点和终局赢家。

死亡原因不足以表达由夜间死亡、死亡技能和关系反应形成的同一时点。仅记录获胜 Faction 也不足以
让投影与赛后流程消费关系型获胜集合。

## Decision

Rule registry 接受有序、纯函数的 action validators。Phase action 明确声明 pass 许可，循环入口插入
可以同步重写返回旧入口的边。Role plugin 通过这些契约贡献关系约束和首夜动作，不向通用 validator
或 phase 图写入具体 Role ID。

Trigger registry 在一个有界批次中展开并去重自动死亡反应。每个死亡事实携带昼夜时点，后续死亡
继承该时点；完整批次写入事件后才开放交互式死亡能力和胜负判断。

Victory registry 先校验基础 evaluators 的一致候选，再依次应用有序 modifiers。modifier 可以补充、
阻断或替换候选，最终候选必须包含非空且唯一的获胜 Player IDs。终局事件、GameState、MatchView 与
赛后资格消费同一获胜集合。

当前 `ruleset-classic-v4` 安装关系型规则所需的 flow plugin 版本与丘比特 plugin。已发布的 V1–V3
Ruleset 保持其原有 plugin 版本、锁和恢复入口；历史死亡与终局事件允许缺少当前字段，当前 Ruleset
产生完整字段。丘比特 plugin 在通用终局事实与身份公开完成后追加公开情侣揭晓，Prompt、时间线和
玩家卡片从同一事件获得最终关系事实。

## Alternatives considered

**在经典阶段和胜负函数中判断具体 Role。** 这会让每个关系型 Role 修改共享权威，并破坏 plugin
语义所有权。

**动态改写 Player 的基础 Faction。** 这会同时改变阵营知识、查验和能力授权，无法表达基础身份不变
但获胜资格变化的关系。

**只通过 Prompt 限制 pass 或目标。** 非法动作仍会被引擎接受，不能成为可重放的规则事实。

## Consequences

- 关系型 Role 的动作、死亡和胜负语义可以由一份 plugin state 与通用 registries 确定性组合。
- 死亡技能、遗言、Sheriff 和终局读取同一个已展开死亡批次，不依赖 phase ID 推断昼夜时点。
- 浏览器和赛后流程可以显示、评分和提名确切赢家，不需要从 Faction 或 Role ID 推断。
- 对局中的私有关系由事件 visibility 和 server projection 保护；终局公开关系由 Role plugin 的公开
  事件进入同一 Prompt 与 Web 投影链路。
- Ruleset catalog 必须继续为每个已发布版本保留精确 factory 和 fingerprint 校验。

## Verification

架构门禁禁止通用运行时出现具体 Role ID 分发。Role、phase、事件、恢复、投影、Prompt、浏览器与
仿真测试共同验证关系私密性、死亡批次顺序、明确赢家和历史 Ruleset 恢复。批准的确定性仿真语料
覆盖真实 action gateway 中的首夜连线与第三方终局。
