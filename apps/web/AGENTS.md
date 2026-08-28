# AgentWolf Web 指南

仓库级约定见[根 AGENTS.md](../../AGENTS.md)。本指令适用于 `apps/web`;
[README.md](README.md) 持有包内契约。

浏览器归属与实时状态阅读 [Web 客户端架构](../../docs/architecture/web-client.md),
projection/重连/播放语义阅读[信息同步](../../docs/architecture/information-synchronization.md),
视觉或交互变更阅读[前端方向](../../docs/frontend.md)。
开发者轨迹读取或仿真向导分别阅读[轨迹](../../docs/architecture/trajectory.md)与
[仿真](../../docs/architecture/simulation.md)。

## 边界

- 通过 `src/api.ts` 消费已校验的 REST 与 WebSocket DTO;游戏规则、持久化、隐藏字段过滤与
  server 编排绝不进入浏览器。
- 页面组合留在 pages,可复用交互留在 components,浏览器副作用留在 hooks,所有 GSAP import
  置于 `src/motion/gsap.ts` 之后。
- 不要手改 `dist/` 或 `dist-types/`;它们是生成的。

## 验证

- Web 源码变更运行 `pnpm test:web`,并在 `apps/web/tests` 下、所属 page、component、hook 或
  helper 旁添加 jsdom 覆盖。
- Web fixture、mock 或浏览器契约变更时运行 `pnpm typecheck:tests`。
- 打包或资产集成变更时运行 `pnpm --filter @agentwolf/web typecheck` 并构建。
- 真实布局、滚动、WebSocket 代理、发言播放集成与 motion 清理留在 Playwright;用户可见变更在
  交接前运行 `pnpm test:e2e`。
