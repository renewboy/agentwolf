# 验证与交付

使用本参考规划测试、证明可观察行为并关闭请求。新增可玩 Role 属于跨层变更;仅有聚焦单元成
功是不够的。

## 测试矩阵

选择被该 Role 触及的每一行:

| 表面                            | 所需证据                                                   |
| ------------------------------- | ---------------------------------------------------------- |
| Role ability                    | 合法与非法动作、目标、pass、使用次数、capability 授权      |
| Phase                           | 插入顺序、激活、actor、动作描述符、顺序/并行边界           |
| 结算                            | lane 顺序、交互、链式效果、胜负之前的死亡反应              |
| Plugin state                    | 严格载荷、reducer 结果、事件可见性、从事件日志恢复         |
| Query/trigger/interrupt/victory | 资格、否定用例、确定性排序、终局优先级                     |
| Endgame                         | Role/ability 完整性、可见 belief、合法反制、差分与安全失败 |
| Prompt                          | 语义归属覆盖、公开/owner 文本、回合契约、私有事实缺席      |
| Projection                      | 叙述、玩家 ID、cue 映射、未授权视图缺席                    |
| Effects                         | artifact 契约合规,外加 catalog 或被动覆盖                  |
| Catalog/board                   | 已安装 Role 列表、自定义 board 校验、内置组合、不可变快照  |
| Ruleset                         | 新 revision/指纹、过期执行拒绝、archive 读取、共享 catalog |
| Strategy                        | Role 映射、索引可达性、逐字源介绍、本地相关文章            |
| Browser                         | Role 数量与颜色、board 选择/组合、可见效果与保密           |
| Simulation                      | 经过评审的引擎与编排 replay,含稳定事件与检查点             |

断言使用引擎事件、DTO、持久快照、渲染的 Prompt、投影视图或浏览器状态。不接受 Agent 的自我
报告作为证据。

## 聚焦命令

迭代期间运行最窄的相关检查。典型命令有:

```sh
pnpm exec vitest run --config vitest.config.ts packages/game-engine/tests/plugin-roles.test.ts
pnpm exec vitest run --config vitest.config.ts packages/assets/tests/prompt-bundles.test.ts
pnpm exec vitest run --config vitest.config.ts apps/server/tests/context-renderer.test.ts
pnpm exec vitest run --config vitest.config.ts apps/server/tests/plugin-projection.test.ts
pnpm exec vitest run --config vitest.config.ts apps/server/tests/role-effects.test.ts
pnpm --filter @agentwolf/server typecheck
pnpm --filter @agentwolf/web typecheck
pnpm check:architecture
pnpm check:artifacts
pnpm check:skills
pnpm check:docs
```

如果实现创建了专属覆盖,使用确切受影响的测试文件。

## 跨层门禁

为已交付的 Role 交接之前,运行:

```sh
pnpm check
pnpm test:simulation
pnpm simulation:check
pnpm test:e2e
git diff --check
```

如果该 Role 变更了已批准的行为,创建一个隔离的、唯一命名的 Match,并使用仓库记录的共享仿真
评审/批准工作流。不要手工编写 fixture、把 `replayGame` 当作事件生成 oracle、覆盖已批准的
fixture,或改动用户的来源 Match。在批准之前同时评审全新引擎与生产编排 replay。

仅当变更改变玩家工具契约、sandbox 可用性或面向模型的动作执行,且凭据可用时,才运行真实 ACP
冒烟测试。使用既有动作形状的普通 Role 新增,通常以渲染 Prompt 与 fake-session 集成证据代替。

## 文档与交付

只更新其持久契约发生变化的归属文档:

- `docs/generated/game-catalog.md` 从已安装 Role 与内置 board 重新生成;
- `docs/product.md` 仅当用户工作流或可见行为契约变化时;
- `docs/architecture/game-runtime.md` 用于共享规则扩展契约;
- `docs/architecture/prompt-and-context.md` 用于 Prompt/上下文归属变更;
- `docs/architecture/information-synchronization.md` 用于可见性、barrier 或投递变更;
- `docs/architecture/web-client.md` 或 `docs/frontend.md` 用于浏览器架构或视觉原则;
- `docs/testing.md` 仅当测试策略或 fixture 策略变化时,新增覆盖不算;
- 最近的 `AGENTS.md` 仅当持久仓库指引变化时。

描述已实现的当前状态。把设计历史、迁移叙事、未来 Role 与调试笔记排除在这些文档之外。

完成时:

1. 重新生成游戏 catalog,并验证最近的 `AGENTS.md` 文件仍然准确;
2. 当需要 proposed Agent Note 时,以已交付的决策、备选方案、后果与稳定验证契约将其改写并
   移入 `implemented/<class>`;
3. 在请求交接中报告聚焦与完整命令、仿真/浏览器证据以及任何显式未运行的检查,而不是单独的
   验收文档。

不要把 `.agentwolf/` 数据库、session、轨迹、生成发言、截图或凭据包含在变更中。
