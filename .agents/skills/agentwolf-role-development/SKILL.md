---
name: agentwolf-role-development
description: 在版本化 Ruleset plugin、Prompt、projection、效果、board、策略内容与验证中实现或修改一个可玩的 AgentWolf 游戏 Role。用于 Role 语义;不要用于 Character 人设卡。
---

# AgentWolf Role 开发

将一个可玩游戏 Role 作为完整的语义 plugin 交付,包含完整的玩家侧与观战侧集成。游戏 Role
控制规则、Ability、知识与胜负;Character 卡控制公开人设与表达;仅涉及 Character 的工作请
另行路由。

## 建立规则契约

编辑之前:

1. 阅读仓库 `AGENTS.md` 链、[游戏运行时](../../../docs/architecture/game-runtime.md)
   与[已采用的规则基线](../../../docs/reference/game-rules.md)。只额外阅读被该 Role 触及的模块
   文档:Prompt/上下文、信息同步或 Web 客户端。
2. 检查工作树并保留无关改动。将既有 Match 与 `.agentwolf/` 运行时数据视为只读,除非用户
   显式授权变更。
3. 写下该 Role 的阵营与种类;时机;合法 actor 与目标;pass 规则;使用次数上限;意图、结果
   与身份的可见性;与保护、转移、死亡、Sheriff、正式胜负和狼人必胜证明的交互;以及是否进入
   内置 board。
4. 当上述任一规则变体未指定、且不同选择会改变可观察结果时,在实现前询问用户。不要悄悄
   选择一个民间流变体。
5. 仅当该 Role 改变难以逆转的架构、隐私、持久数据或共享扩展契约时,才创建 proposed Agent
   Note。普通 Role 新增不需要持久计划文件。

按行为而非按名字选择既有示例:

- `VillagerRole`:被动 Role。
- `SeerRole` 或 `GuardRole`:普通夜晚动作。
- `MagicMirrorGirlRole`:plugin event 状态与私有精确结果。
- `HunterRole`:死亡决策 trigger。
- `WhiteWolfKingRole`:公开 interrupt、共享阵营 capability 与链式死亡结算。

## 按语义归属实现

在改动游戏行为之前阅读[引擎集成](references/engine-integration.md)。它为 Role 元数据、
capability、ability、阶段、效果、plugin event、query、trigger、interrupt、victory、board 组成与
Ruleset 兼容性提供路由。

在使 Role 可安装或可见之前阅读[呈现集成](references/presentation-integration.md)。它涵盖配套
Prompt bundle、可见性安全的叙述与效果、本地化 UI 资产、徽章颜色、玩家策略页面与内置
board。

在编写测试或关闭请求之前阅读[验证与交付](references/verification-and-delivery.md)。按 Role 的
实际行为选择检查项,并为已交付的 Role 运行完整的跨层门禁。

## 架构不变量

- 通用内核、Prompt 运行时与 server 组合代码不含具体 Role-ID 或 Ability-ID 分发。使用
  capability、registry、声明的阶段动作与 plugin 持有的语义。
- 一个 Role plugin 拥有它的 Role、ability、Role 专属阶段、plugin event 与相关语义注册。保持
  版本化 Ruleset manifest 为声明式。
- 每个 Role 声明 `endgameModel`,每个 ability 声明 `endgameImpact`;material ability 必须由同一
  Role plugin 注册可组合的 endgame 模型。缺少模型的 Role 不能通过 Ruleset 构建。
- 加入夜间 batch 的 ability 必须声明 `nightResolutionStage`;狼刀及影响狼刀结果的保护属于
  `wolf-priority`,毒药、查验等只在狼刀胜负检查未结束 Match 时执行的能力属于
  `post-wolf-priority`。`nightAttack` 只能声明为 `wolf-priority`。
- 校验是纯函数。游戏改动以 append-only 事件进入;持久 Role 状态必须能从事件与确定性
  Ruleset 配置重建。
- Ruleset 使用稳定 family 与整数 revision。已安装 manifest 的语义变更必须递增当前 revision；
  先前 revision 的终局 Match 由 archive 读取,不保留历史 runtime resolver。
- 每个已安装 Role 拥有与源匹配的公开介绍、映射的玩家策略页面,以及完整效果覆盖或显式的
  被动 Role 声明之一。

## 完成标准

只有当该 Role 可以通过预期的 board 路径被选中、通过真实 action gateway 完成其合法与非法动作、
能从事件日志恢复、不向未授权视图暴露私有事实、不会让狼人必胜证明使用未授权身份、渲染其精确
Prompt 与公开呈现,并通过与其范围相称的聚焦、仓库、仿真与浏览器验收时,才算完成。
