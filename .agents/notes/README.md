# Agent Notes

Agent Note 保留 AgentWolf 重大决策的原因、备选方案与后果。其路径编码了两个维度:

```text
.agents/notes/<lifecycle>/<class>/YYYY-MM-DD-<slug>.md
```

## Lifecycle

- `proposed`:在实现前接受评审;可以包含计划与验收标准。
- `implemented`:已交付的决策,以现在时态撰写,并与当前实现保持一致。
- `rejected`:被否决的提案,在状态中附一行否决原因。
- `archived`:冻结的 implemented 历史,不再指导日常工作。

implemented 决策可以更新事实性的路径、符号、默认值与机制。推翻决策或其理由则需要新的
Note 来取代旧 Note 并链接它。

## Classes

- `feature`:一项主要的面向用户或面向模型的能力。
- `bug-fix`:一个重大缺陷,其预防需要一项持久决策。
- `simplification`:移除行为或暴露面。
- `architecture`:结构、依赖方向、运行时词汇或跨包归属。
- `process`:仓库工作流、工具或治理。
- `testing`:测试架构或长期验证策略。

## Format

每个 Note 都以下列内容开头:

```markdown
# Agent Note: <title>

Status: proposed | implemented | rejected — <reason>
```

proposed Note 包含 `Problem`、`Proposal`、`Alternatives considered`、`Acceptance criteria` 与
`Risks`。implemented Note 包含 `Problem`、`Decision`、`Alternatives considered` 与
`Consequences`;可以追加 `Verification` 用于记录稳定的检查手段与已知覆盖边界。

implemented Note 永远不保留 `Proposal`、`Plan`、`Migration plan`、`Acceptance criteria`、TODO、
未勾选的清单项或带日期的测试总数。rejected Note 只在其理由能够防止一个可能犯的错误时,保留
提案与备选方案。

lifecycle/class 目录树就是清单。不要添加生成式或手工维护的中央索引。
