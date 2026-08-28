# AgentWolf server

`@agentwolf/server` 是应用组合根。它连接 Fastify、SQLite、确定性引擎、Prompt 资产、ACP 玩家
Session、MCP 动作、实时 projection、赛后复盘、轨迹诊断与确定性仿真。

## 职责

- REST 与 WebSocket 路由组装及 schema 校验。
- Agent Tool/Profile、Character、board、settings 与 Match 目录。
- 不可变的 Match 设置、活跃运行时编排、恢复、暂停、继续与删除。
- 用于 events、Session 绑定、delivery、复盘与开发者数据的 SQLite schema 与 repository。
- 可见性安全的视图 projection 与实时连接协调。
- 玩家绑定的 MCP 动作传输、Prompt 上下文适配与 Session 恢复。
- 轨迹采集、读取与语义审计。
- 仿真候选采集、双 runner 评审与 fixture 批准。

跨包设计拆分在[架构模块](../../docs/architecture.md)中。

## Ownership map

- `app.ts`:HTTP 与 WebSocket 组装。
- `repository.ts` 与各聚焦 repository:持久化 SQLite 访问。
- `match-manager.ts`:Match 创建、查找、恢复与删除。
- `match-runtime.ts`:活跃回合编排与 engine/action 边界。
- `projector.ts`:server 持有的可见性安全 DTO。
- `mcp.ts`:玩家绑定的结构化动作传输。
- `player-runtime.ts`:单个逻辑 Session 的 delivery 与恢复。
- `postgame-review-coordinator.ts`:复盘倒计时、sheets、聚合与反思。
- `trajectory*`:采集、service、脱敏、projection 与语义审计。
- `simulation*`:候选采集、runners、工作流与 fixture 批准。

新行为归属现有最窄的 owner。游戏规则留在 game-engine,通用 ACP 进程行为留在 acp,schema 留在
contracts,模型/UI 呈现留在 assets。

## 外部边界

每条路由都从 contracts 解析请求与响应 schema。SQLite JSON 在 repository 边界解析。浏览器 DTO
不含隐藏字段。开发者 HTTP/WebSocket 路由仅在 loopback 开发者模式下注册。

数据库变更包含前向迁移与迁移覆盖。运行时恢复从 events 重建引擎并恢复已持久化的 Session ID;它
从不发明替代的 Match 状态。

## 验证

单元/集成测试使用内存 repository 与假 ACP 进程,除非测试明确位于 `tests/live` 下。路由字段获得
集成覆盖;跨包行为经由根级门禁运行。用户可见流程额外接受浏览器验收。
