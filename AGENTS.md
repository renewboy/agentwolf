# AgentWolf 仓库指南

AgentWolf 是一个 TypeScript workspace,用于在长驻的 ACP Agent Session 之间运行狼人杀对局。
本文件是仓库地图;详细的产品与架构事实归属于各自的文档与 package。

## 指令范围

- 编辑任何文件前,先读取距离最近的 `AGENTS.md` 并跟随其父级链接。
- 根级规则适用于全仓库。更近的 `AGENTS.md` 可以新增或覆盖子树规则。
- 每个嵌套的 `AGENTS.md` 链接到其最近的祖先,且每个 `AGENTS.md` 不超过 200 行。
- 保留无关的工作区改动。编辑后复查适用的指令,仅在持久性指引发生变化时更新它们。
- **语言约束**:所有持久化文档(含 `AGENTS.md`、README、docs、Agent Note、Skill 文档及后续
  新增的任何文档)一律使用中文撰写;专有术语保留英文。运行时 prompt 源除外。

## 阅读路线

- 修改任何持久化文档、prompt、运行时 Skill、工具描述、UI 文案、角色文案或公开公告之前,
  MUST Read [artifacts_rules.md](artifacts_rules.md)。
- 文档结构与行文规范:[文档标准](docs/AGENTS.md)。
- 产品行为与 V1 范围:[产品](docs/product.md)。
- 系统边界、跨模块设计与模块路由:[系统架构](docs/architecture.md)。
- 编写、重构或审查架构设计文档:
  [架构文档开发 Skill](.agents/skills/agentwolf-architecture-documentation/SKILL.md)。
- 游戏内核、Rulesets、Roles、阶段、效果与胜负:
  [游戏运行时](docs/architecture/game-runtime.md)。
- 死亡反应、正式胜负、狼人必胜证明与终局顺序:
  [游戏结算与终局](docs/architecture/game-settlement.md)。
- Prompt bundles、可见模型事实与玩家上下文:
  [Prompt 与上下文](docs/architecture/prompt-and-context.md)。
- ACP 进程、持久 Session、动作与恢复:
  [ACP Session 运行时](docs/architecture/acp-session-runtime.md)。
- 可见性、barrier、发言送达、回放与重连:
  [信息同步](docs/architecture/information-synchronization.md)。
- 对局配置、快照、持久化、删除与赛后复盘:
  [Match 生命周期](docs/architecture/match-lifecycle.md)。
- ACP 回合记录、脱敏、审计与开发者诊断:[轨迹](docs/architecture/trajectory.md)。
- 真实 Match 采集、确定性 runners 与 fixture 审批:[仿真](docs/architecture/simulation.md)。
- 浏览器归属与投影实时状态:[Web 客户端](docs/architecture/web-client.md)。
- 视觉与交互方向:[前端](docs/frontend.md)。
- 测试策略与命令:[测试](docs/testing.md)。
- 游戏规则源基线:[游戏规则](docs/reference/game-rules.md)。
- 可玩 Role 开发:[Role 开发 Skill](.agents/skills/agentwolf-role-development/SKILL.md)。

只阅读与本次改动相关的路线。不要默认加载所有文档。

## Workspace 地图

- `packages/contracts`:branded IDs、wire schemas、events、actions、settings 与 view DTOs。
- `packages/game-engine`:确定性内核、版本化 Rulesets、插件、boards 与 replay。
- `packages/acp`:ACP 进程、协议、Session、stream 与传输原语。
- `packages/assets`:模型 Prompt bundles、玩家 Skills、本地化文案、Characters 与样式。
- `apps/server`:Fastify、SQLite、Match 编排、projection、MCP、恢复与开发者工具。
- `apps/web`:React 配置、设置、lobby、观战与开发者 UI。
- `scripts`:仓库检查、生成器、开发入口与 CI 辅助脚本。
- `vendor/agent-arena-core`:固定 revision 的 Ruleset、game/ACP/Prompt/Match runtime、store ports、
  SQLite adapter、trajectory、simulation、Web runtime、React adapters、harness 与 testkit packages。
- `.agentwolf/`:仅运行时数据 — 数据库、生成的 Skills、workspaces、Sessions 与日志。

包内契约放在各 package 或 app 的 README;跨包设计放在架构模块文档中,不要在两处重复。

## Package 依赖方向

```text
contracts <- game-engine
    ^             ^
    |             |
 assets          acp
    ^             ^
    +------ server ------+
              ^
              |
             web
```

- `contracts` 与 `game-engine` 不 import server、Web、ACP、文件系统、网络或资产代码。game-engine、
  assets、acp、server、Web 与 repository harness 只从固定 Core revision 消费各自允许的公开入口。
- server 在序列化前过滤每个视图;浏览器永远收不到隐藏字段。
- 为可机械校验的依赖或隐私规则添加可执行的架构检查。

## 命令

```sh
git submodule update --init
pnpm install --frozen-lockfile
pnpm --dir vendor/agent-arena-core check
pnpm typecheck
pnpm lint
pnpm test:coverage
pnpm build
pnpm check
pnpm test:e2e
pnpm dev
```

迭代期间使用聚焦测试。跨层改动和交付前运行 `pnpm check`;可见浏览器行为变化时运行
`pnpm test:e2e`。

## 源码规则

- 使用 ESM、严格 TypeScript、跨边界的 branded IDs,在 wire/config/用户输入边界使用 Zod,
  封闭 union 使用穷举 switch。
- 不要用 shell 字符串插值执行子进程。
- 玩家 Skill 源放在 `packages/assets/player-skills`;仓库根 `.agents/skills` 只放编码代理
  Skills。
- 运行时 secrets、Skill 素材和隐藏游戏状态不进入浏览器 bundle 或公开事件。

## 运行时不变量

- Rules 与 Roles 是版本化插件;内核中不含任何具体 Role 或 Ability 分支。
- 游戏状态是事件溯源的,可确定性重放。
- 每个 Seat 在完整 Match 与赛后生命周期内拥有一个持久逻辑 ACP Session。
- 结构化动作经由 action gateway 进入;自然语言发言经由同一个权威 Match runtime 流式传输
  并提交。
- 并行阶段使用一份冻结的 barrier 快照,仅在所有有资格的回合落定后揭晓结果。
- server projection 掌管保密;模型 Prompt 渲染只消费已过滤的可见事实。
- Character 卡只影响公开表达,处于游戏规则与持久事件之外。

这些不变量背后的确切契约由所链接的架构模块文档持有。

## 测试与运行时数据

- 规则加单元覆盖,协议/projection 边界加集成覆盖,可见交互流程加浏览器覆盖。
- 断言协议或外部状态,而非 Agent 的自我报告。
- 测试创建唯一记录并在 teardown 中清理;绝不复用或修改用户拥有的数据。
- 运行时数据放在 `.agentwolf/` 下;不提交 Sessions、凭据、Match 日志、生成发言、截图或
  录像。
- secrets 以环境变量名存储引用,绝不存值。

## 决策与完成

- 重大、难以逆转的工作以 proposed Agent Note 起步,放在 `.agents/notes` 下;局部修复和
  普通功能不需要持久决策记录。
- 交付时将 proposed Note 改写为现在时态的已实现事实。持久化文档中不保留执行清单或带日期
  的测试总数。
- 只更新拥有已变化公共事实或跨包契约的文档。新增测试、实现分支、Role 或屏幕细节本身不
  需要修改常设文档。
- 生成目录保持生成态,源与所属测试一起更新,并在交接中报告具体验证结果。
