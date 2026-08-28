# Prompt 与玩家上下文架构

## 职责

该模块将已安装的游戏语义与某位玩家的 visibility-safe 状态转换为通过 ACP 发送的确切模型
Prompt。它拥有 Prompt bundle 加载、语义呈现覆盖、严格 Nunjucks 渲染、玩家 Skill 送达、
Character 框定与上下文预算审计。

Prompt 资产位于 [`packages/assets`](../../packages/assets/README.md);server 将解析后的
Ruleset 与 Match 状态适配为 plain assets-owned 事实。

## Bundle 归属

模型 Prompt 使用 `packages/assets/prompts` 下的非本地化 Nunjucks bundles。`_core` 拥有 Session
框定、通用布局、Character 框定、引用格式化、五个对局内 MCP 工具与一个赛后复盘 MCP 工具。
功能性与 Role 插件拥有自己的 Role、Ability、Phase、事件、公告与 interrupt 呈现。

server 将已安装的 Ruleset 贡献记录适配为一份 plain 语义清单。assets loader 将 bundle 声明与
该清单比对,并在首次渲染前冻结一份 registry。

## 模板形态

结构化内容、循环与条件分支使用内聚模板。标签、过渡、工具标题与回执可以使用其语义所有者上
的类型化单行字段。Prompt 资产不含通用字符串字典、locale 树、copy-key 查找服务、条件片段
文件、句级模板、Prompt 版本选择器,也不含针对具体 Role、Ability、Phase 或 Plugin ID 的
server 分支。

## 事实投影

`ContextRenderer` 将当前 Match 投影与动作预期转换为一份严格事实契约,包含可见性过滤后的
事件、公开状态、当前动作契约与行为者自身状态。模板源由仓库持有并受路径约束在已安装 bundles
与声明的依赖之内。公开模板不能引用更私密的资产。

## Prompt 流

foundation 覆盖其送达游标,并将每个可见的引导事实精确渲染一次:公开 board 规则、公开 Role
介绍、行动 Role 与 abilities、适用的私密阵营知情,以及行动 Character 卡。它不包含任何
seat 到 Role 的披露。

增量回合渲染游标确认之后新可见的事件,外加一份当前阶段/动作契约。它省略玩家自己已知的已
提交发言,同时保留所有其他必需的公开发言。不确定送达后的续篇是紧凑的,只描述当前动作边界;
它不重放 foundation 或完整历史。

可见历史保持事件顺序,并通过冻结 registry 解析 Player、Role、Ability、Phase 与 Faction 引用。
玩家撰写的发言文本被保留,而不是由裁判呈现层重新排版。

## 玩家环境

构建过程将完整的玩家 Skill 目录复制到 `.agentwolf/skills`。每个 Match workspace 将其
`.agents/skills`、`.claude/skills` 与 `.trae/skills` 目录链接到该共享输出。

玩家运行时暴露玩家契约、所选 Skills、本地读取/搜索工具、五个对局内动作与一个赛后复盘动作。
环境用户记忆、无关 Skills、仓库开发指令、Web 访问、变更类工具、hooks、插件与子代理保持
缺席。

每次引导轨迹将提供方报告的完整模型上下文对照 12,000 token 上限进行审计。实际发送的 Prompt
存入轨迹;历史 Prompt 文本从不基于当前模板重新渲染。
