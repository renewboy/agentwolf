# Agent Note: 插件持有的 Prompt bundles

Status: implemented

## Problem

中央 Prompt 目录或 server 分发表在 RulePlugin 之外重复具体游戏 ID,使每次 Role 扩展都成为
共享编辑,并存在把私有模型上下文混入公开 assets 的风险。

## Decision

每个已安装的 RulePlugin 拥有一份同 ID 的配套非本地化 Nunjucks bundle。`_core` bundle 只拥有
Session 框架、通用布局、Character 框架、引用与工具契约。功能与 Role bundle 拥有各自完整的
Role、Ability、Phase、event、公告与 interrupt 呈现。

server 将冻结的 Ruleset 贡献记录适配为一份由 assets 持有的简单语义清单。bundle registry 在渲染
之前校验精确覆盖、归属、import、受众方向、路径包含与 event-matcher 歧义。`ContextRenderer`
传入公开与 actor 自有的可见事实,而非引擎状态。

Trajectory 存储精确渲染的 Prompt 文本。运行时与 fixture 不携带 Prompt 版本选择器。当前契约
定义于
[Prompt 与玩家上下文](../../../../docs/architecture/prompt-and-context.md)。

## Alternatives considered

**全局 Role、阶段与 event 呈现表。** 它们重建中央语义权威,并要求每个 plugin 进行互不相关
的共享编辑。

**本地化 Prompt 词典或一句一模板。** 模型指令不是 UI 文案;碎片化会遮蔽完整的动作契约与条件
上下文。

**引擎定义中的 Prompt 元数据。** 这会把确定性规则耦合到 assets,并反转 package 依赖方向。

**可选择版本的 Prompt 渲染。** 精确发送的文本本身就是持久证据;运行时选择器会无限期保留
过时的呈现分支。

## Consequences

新的游戏语义通过同一个 plugin 归属边界扩展 Prompt 呈现。缺失、重复、歧义、跨受众或路径逃逸
的呈现会在第一次渲染之前失败。通用运行时代码与公开模板保持不含具体的私有游戏分支。
