# 呈现集成

当 Role 已安装或任何 Role 可见事实变更时使用本参考。Prompt 文本、本地化产品文案、玩家策略
与观战效果各有独立归属。

## 1. 配套模型 Prompt bundle

创建 `packages/assets/prompts/bundles/plugin-role-<slug>/`。其 basename 与 `bundle.json` 的
`pluginId` 必须与已安装 Rule plugin ID 完全一致。运行中的 Ruleset 语义贡献索引必须与该
bundle 声明的 Role、Ability、Phase 与 plugin event 完全匹配。

bundle 包含:

- 一份 Role 声明,含原子 label、完整 `role.njk` 与每个自有 ability;
- 每个 Role 专属阶段,含受众、白天标记,以及每个交互式阶段的一份完整回合模板;
- 每个 Role 专属 plugin event,以 `pluginId` 与 `eventType` 声明式匹配,当事件本身不应追加模型
  叙述时包含显式 `omit`;
- Role 发出公告代码时自有的公开公告;
- 在其他阶段中提供的每个 ability 的 interrupt 模板。

`role.njk` 拥有可读的 `public` 与 `owner` 分支。public 分支定义当前规则,并逐字包含映射策略
Role 页面的 `角色介绍` 源文。owner 分支陈述身份、阵营、ability 与结构化动作所需的正式
ability ID。

为公开奠基文本、owner 文本、当前回合指令、合法选项、事件渲染与隐藏事实的缺席,新增或扩展
Prompt bundle 与 `ContextRenderer` 测试。

## 2. 玩家策略覆盖

每个已安装 Role 映射到
`packages/assets/player-skills/werewolf-strategy/references/roles` 下的一个页面。该页面必须可从
Role 索引到达,并包含 `技能介绍`、`角色介绍` 与 `相关阅读`,其中含一篇本地文章链接。在
`scripts/harness/check-skills.ts` 中添加 Role-ID 到页面的映射。

公开 Prompt Role 模板必须逐字包含该页面的 `角色介绍` 章节。不要编造或概括源介绍。如果没有
合适的源页面或别名,停下并询问用户应使用哪份权威素材。不要仅为新增一个 Role 而运行 catalog
刷新;它同步完整的源 catalog。

仅玩家可见的 Skill 保持在 `packages/assets/player-skills` 并被复制到 `.agentwolf/skills`。
`.agents/skills` 下的项目编码 Skill 不会被复制进玩家 workspace。

## 3. 本地化产品与 board 呈现

向 `packages/assets/copy/zh-CN.json` 添加本地化的用户可见值:

- `Role.displayNameKey` 引用的 Role 展示键;
- 实际展示的 ability、阶段、叙述/时间线与效果标签;
- 适用时的内置 board 名称与描述。

自定义 board 管理会自动发现已安装 Role。内置 board 还需要显式的 server catalog 条目。更新
枚举内置 board 或已安装 Role 数量的 API/集成与浏览器预期。

## 4. 可见性安全的叙述与效果

对于新 plugin event,在 `packages/assets/src/plugin-events.ts` 中添加一个类型化呈现,它:

- 在呈现边界解析事件数据;
- 只返回相关玩家 ID;
- 产出本地化叙述或时间线文本;
- 把已可见事件映射为可选的语义效果 cue。

按适用情况测试上帝、闭眼、归属玩家、阵营与无关玩家视图;私有结果必须带有缺席断言。

在 `packages/assets/src/role-effects.ts` 中注册主动反馈,含 Role ID、适用时的 Ability ID、本地
化标签、有界时长、层级与语义图标。除非确需新的视觉原语,否则复用通用 Web controller。若添
加图标原语,扩展集中的 Phosphor 图标映射。

每个已安装 Role 必须满足以下路径之一:

- 每个主动 ability 都有 role-effect 定义,且该 Role 至少有一个定义;或
- 该 Role 没有主动视觉事件,并被加入显式 `passiveRoleIds` 豁免。

## 5. Role 徽章与视觉身份

为每个已安装 Role 给予一个带标签的语义颜色,并在 board 管理、Match 设置、观战卡片与轨迹视
图之间保持一致:

1. 在 `packages/assets/styles/tokens.css` 中添加 full 与 soft token;
2. 在 `packages/assets/styles/components.css` 中映射 Role ID;
3. 隐藏身份保持在中性 `hidden` 徽章上;
4. 更新 Playwright 调色板/计数断言与具体颜色检查。

仅当 catalog 的默认效果信号不足时,才在 `packages/assets/styles/screens.css` 中添加效果专属
CSS。所有视觉变更遵循 `docs/frontend.md` 并使用 asset 持有的 token。
