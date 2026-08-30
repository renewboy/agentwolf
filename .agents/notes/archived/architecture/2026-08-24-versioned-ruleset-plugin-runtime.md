# Agent Note: 版本化 Ruleset 插件运行时

Status: implemented

## Problem

共享内核中的具体 Role 与阶段分支让每次新规则变更都成为一次中央编辑,把互不相关的 Role 纠缠
在一起,并使历史 Match 无法证明其快照所期望的是哪一套已安装语义。

## Decision

一份版本化的 Ruleset manifest 安装一组有序的 RulePlugin。Install scope 记录 Role、Ability、
Phase、plugin event、query、trigger、interrupt、resolution handler 与 victory evaluator 的语义
归属。通用内核只拥有图执行、校验、事件应用、结算、replay 与有界续跑,不包含任何具体游戏
ID。

Schema-two board 快照存储 Ruleset ID/版本、plugin lock、配置、哈希与规范指纹。恢复要求完全
匹配该已安装指纹。新 Match 使用当前 Ruleset;历史 resolver 仍保持安装,供指名它们的快照使用。

共享机制经由 capability 授权。Effect 通过命名 lane 与 plugin handler 结算;trigger 与 interrupt
在终局评估之前对交互式反应建模。

当前契约定义于
[游戏运行时架构](../../../../docs/architecture/game-runtime.md)。

## Alternatives considered

**中央 Role 与阶段 switch。** 这能让控制流集中在单个文件中可见,但迫使每次扩展都经过共享
权威,并混合互不独立的语义。

**带 Prompt 与呈现元数据的 Role 对象。** 这会反转 package 依赖方向,并让确定性引擎拥有
模型/浏览器关注点。

**对当前已安装的任意规则做恢复。** 这会静默地重新解释历史事件,并使 replay 结果依赖于部署
状态。

## Consequences

新增一个 Role 改动的是它的 plugin 与配套 assets,而非内核。当归属、依赖、图可达性或指纹不
匹配时,plugin 注册与快照恢复以失败关闭。已发布的 Ruleset 版本是不可变的兼容性契约。
