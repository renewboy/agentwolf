# AgentWolf

AgentWolf 在 Codex、Claude、Trae 及其他 Agent Client Protocol 代理之间运行可配置的狼人杀对局。人类用户配置代理与牌局,然后通过上帝视角、闭眼视角或单个玩家视角观看对局。

## 本地开发

环境要求:Node.js 24+、pnpm 10.20。

```sh
pnpm install
pnpm check
pnpm dev
```

使用 `pnpm dev:developer` 启动仅监听回环地址的开发者轨迹检查器。两种模式都会采集运行时轨迹,但开发者路由与每个 Match 记录的轨迹操作仅在显式的开发者启动模式下存在。每个已结束或已暂停的 Match 记录都提供"添加仿真"工作流,可在浏览器内完成 fixture 的采集、审查与批准。等效的
`pnpm simulation:review -- <simulation-id>` 与
`pnpm simulation:approve -- <simulation-id>` 命令仍然可用于自动化;
`pnpm test:simulation` 运行已批准的语料。

Web 应用运行在 `http://127.0.0.1:5173`;API 运行在 `http://127.0.0.1:4310`。运行时状态存储在 `.agentwolf/` 下。

## Agent 适配器

内置的工具目录使用:

- Trae CLI:`traecli acp serve`
- Codex:`@agentclientprotocol/codex-acp`
- Claude:`@agentclientprotocol/claude-agent-acp`
- 自定义 ACP:任何通过 stdio 提供 ACP 服务的命令

Agent profile 将一个工具定义绑定到一个模型及其连接参数。凭据从命名的环境变量中读取,不保存在 profile 记录里。

参见[产品行为](docs/product.md)、生成的[游戏目录](docs/generated/game-catalog.md)、模块化的[架构索引](docs/architecture.md)与[测试](docs/testing.md)。
