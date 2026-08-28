# AgentWolf server 指南

仓库级约定见[根 AGENTS.md](../../AGENTS.md)。本指令适用于 `apps/server`;
[README.md](README.md) 持有包内契约与 ownership map。

只阅读被本次改动触及的架构模块:[Match 生命周期](../../docs/architecture/match-lifecycle.md)、
[ACP Session 运行时](../../docs/architecture/acp-session-runtime.md)、
[信息同步](../../docs/architecture/information-synchronization.md)或
[轨迹与仿真](../../docs/architecture/trajectory-and-simulation.md)。在更改测试基础设施或
fixture 策略前阅读[测试](../../docs/testing.md)。

## 边界

- 确定性规则留在 `packages/game-engine`,wire schema 留在 `packages/contracts`,通用 ACP 进程
  行为留在 `packages/acp`,模型/UI 呈现留在 `packages/assets`。
- 新行为归属现有最窄的 server owner。新的 REST 或 WebSocket 字段始于 contracts schema,并获得
  路由级集成覆盖。
- SQLite 变更包含前向迁移与迁移覆盖。
- 每个视图在序列化前都经过 server 持有的可见性过滤进行 projection。
- 不要手改 `dist/`;它由包构建生成。

## 验证

- 将单元与集成覆盖保持在 `apps/server/tests` 下;使用内存 repository 与假 ACP 进程,除非测试
  明确位于 `tests/live` 下。
- 使用 `pnpm exec vitest run --config vitest.config.ts apps/server/tests/<name>.test.ts` 运行
  聚焦测试,使用 `pnpm --filter @agentwolf/server typecheck` 进行 typecheck。
- 跨包、持久化、协议或用户可见变更运行根级门禁。
