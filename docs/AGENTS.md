# AgentWolf 文档标准

仓库级规则见[根 AGENTS.md](../AGENTS.md)。本指令适用于面向人类的文档、package README、
Agent Note 以及面向模型的持久化行文。

## 一事一主

每个事实只有一个权威归属地。其他文档概括其目的并链接到归属地;不复述其机制、边界情况、
测试清单或实现历史。

| 文档                     | 拥有                       | 不拥有                  |
| ------------------------ | -------------------------- | ----------------------- |
| 根 `AGENTS.md`           | 常设指令与导航             | 产品或子系统设计        |
| `docs/architecture.md`   | 系统边界、跨模块设计与路由 | 模块内部                |
| `docs/architecture/*.md` | 一个主要跨包模块           | 无关模块或 package API  |
| Package/app README       | 局部契约、失败模式、限制   | 跨包设计                |
| `docs/product.md`        | 用户可观察行为             | 实现与测试细节          |
| `docs/frontend.md`       | 视觉与交互原则             | 屏幕清单或 Web 架构     |
| `docs/testing.md`        | 测试策略与 fixture 政策    | 逐项功能的覆盖清单      |
| 生成参考                 | 详尽的源码派生目录         | 手写解释                |
| Agent Note               | 重大提案或决策及其取舍     | 执行日志或当前 API 参考 |
| 代码、schemas、测试      | 确切行为与可强制执行的事实 | 重复的行文目录          |

## 架构层级

`architecture.md` 负责系统边界、主要组件、端到端运行链路、跨模块状态所有权与专项导航。每个
主要模块在 `docs/architecture/` 下有一个文件;更底层的 package 细节放在 package 或 app 的
README 中。系统文档与专项文档都必须解释设计关系,不能退化为目录索引或实现流水账。

编写、重构或审查架构文档时使用
[AgentWolf 架构文档开发 Skill](../.agents/skills/agentwolf-architecture-documentation/SKILL.md),并按其
[架构文档模板](../.agents/skills/agentwolf-architecture-documentation/references/architecture-document-template.md)
选择设计问题、文档粒度与 Mermaid 制图。

每个 `AGENTS.md` 不超过 200 行。`docs/architecture.md` 与 `docs/architecture/` 下每个文件
不超过 500 行。这些是简单的可读性上限,不是内容目标:按既有语义归属拆分,而不是把无关事实
压缩到一起。

## 更新路由

- 用户工作流或可见失败变化:当读者需要改变操作方式时,更新 `product.md`。
- Package 依赖方向或模块职责变化:更新系统架构和恰好一个模块架构文档。
- 包内 API、配置或失败行为变化:更新对应 package README 或 JSDoc。
- 可见性、送达、barrier、回放或重连变化:更新信息同步模块。
- Turn/Record、脱敏、轨迹读取或语义审计变化:更新轨迹模块。
- Match capture、candidate、runner 或 fixture 审批变化:更新仿真模块。
- 视觉语言或交互原则变化:更新 `frontend.md`;屏幕细节留在代码和浏览器测试里。
- 测试基础设施或 fixture 政策变化:更新 `testing.md`;新增覆盖不需要。
- 新增 Role 或 board:更新源码、Prompt/策略资产、测试和生成目录。仅在扩展契约变化时才
  更新架构文档。
- 局部修复通常只需要代码与测试。仅在所属契约变化时才更新常设文档。

## Agent Notes

[Agent Notes](../.agents/notes/README.md) 使用生命周期与类别文件夹。只有影响架构、持久化或
wire 格式、安全/隐私、跨层契约、测试策略或其他难以逆转选择的决策才需要 Note。

已实现的 Note 记录当前决策、真实的备选方案、后果和稳定的验证契约。它不包含待办清单、交付
日记、测试计数或未来计划。

## 校验

- 保持相对链接有效,并让嵌套的 `AGENTS.md` 链接到其最近父级。
- 不手改生成的参考文件;从源码重新生成。
- 文档变更后运行 `pnpm check:docs` 与 `git diff --check`。
- 运行任何被修改的可见字符串、Prompt、命令或接口所属的行为检查。
