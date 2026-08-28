# Agent Note: 确定性仿真语料

Status: implemented

## Problem

单元测试与事件日志 replay 无法证明当前编排仍然提示正确的玩家、遵守并行 barrier、恢复投递,
并从真实 Match 决策出发到达经过评审的用户可见游戏语义。

## Decision

已结束或暂停的 Match 可以产出脱敏的本地候选。评审与批准生成紧凑的、版本化的 fixture,包含
不可变 board、玩家决策、actor barrier、投递结果、语义 event oracle 与终局检查点,不含原始
Prompt 或机密素材。

每份获批 fixture 走两条确定性路径:一个全新的 game-engine runner,以及一个使用 fake Session
的内存态生产 Match-runtime runner。顺序 replay 向引擎询问当前 actor;并行 replay 要求完整的
捕获 barrier。稳定的 fixture/variant 种子覆盖完成顺序、恢复、重启与回放结果。

CLI 与浏览器工作流调用同一个 simulation service。候选批准绝不覆盖既有 fixture,也不改动来源
Match。当前设计记录于
[确定性仿真](../../../../docs/architecture/simulation.md)。

## Alternatives considered

**把捕获的事件日志当作测试来重放。** 重新应用旧事件只证明 reducer,不能证明当前引擎与编排
会生成等价行为。

**只使用 game-engine runner。** 这会漏掉投递 cursor、Session 行为、动作 barrier、回放挂起与
重启恢复。

**提交原始生产捕获。** 原始标识符、Prompt、推理、诊断与凭据对确定性回归既不必要,作为
fixture 也不安全。

## Consequences

经过评审的真实 Match 行为成为横跨规则与编排层的免凭据回归语料。fixture 变更需要显式评审,
并保留紧凑的语义 oracle 而非生产转录。
