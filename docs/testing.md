# 测试与验收

测试证明外部行为与架构边界。它们不以 Agent 自我报告为替代,本文档也不维护逐项功能的覆盖
清单。

## 测试层级

- Vitest `node` 项目拥有纯规则、schemas、渲染、规范化、目录、ACP 进程、repositories、
  services 与协议集成。
- Vitest `web` 项目运行在 jsdom 中,使用 React Testing Library、user-event 与 jest-dom。它
  拥有浏览器 API 客户端、纯表现逻辑、可复用交互、hooks、页面状态与组件行为。
- Property tests 拥有广泛的确定性不变量,如合法玩家人数、事件单调性、replay 与死亡/动作
  顺序。
- 集成测试拥有 REST/WebSocket 契约、SQLite repositories 与迁移、Match 运行时、ACP 协议
  fakes、projection、送达、恢复、赛后、轨迹服务和仿真服务。
- Contract tests 在生产者与消费者边界解析共享 fixtures。
- 仿真语料测试通过游戏引擎与生产编排、使用确定性 fake Sessions 重放已审查的真实 Match
  决策。
- 浏览器测试拥有可见工作流、键盘/焦点行为、响应式包含、实时重连、语音播报与动效清理。
- 可选的 live smokes 拥有已安装 ACP 适配器行为、真实结构化动作、本地 Skill 访问与 sandbox
  拒绝。它们不在无凭据的 CI 中运行。

详细场景属于实现旁边、以描述性命名的测试与 fixture。

## 命令

```sh
pnpm typecheck
pnpm typecheck:tests
pnpm lint
pnpm test:web
pnpm test:web:coverage
pnpm test:coverage
pnpm build
pnpm check
pnpm test:e2e
pnpm test:simulation
pnpm simulation:check
```

`pnpm check` 是确定性的仓库门禁:架构、artifacts、文档、Skills、类型、lint、格式化、依赖
卫生、重复、单元/集成覆盖与生产构建。它排除需要凭据的模型调用。

迭代期间使用聚焦的 Vitest 或 Playwright 目标。跨层改动运行完整仓库门禁,用户可见的浏览器
行为运行 `pnpm test:e2e`。仅在提供方行为在范围内且凭据可用时运行 live smokes。

## 覆盖率契约

`pnpm test:coverage` 一起运行 Node 与 Web 的 Vitest 项目。覆盖率包含 `packages/*/src`、
`apps/server/src` 与 `apps/web/src` 下的产品运行时源码。仓库脚本保持在它们专属的静态与单元
检查之下。固定 submodule 的源码由其独立仓库执行逐文件覆盖率门禁;AgentWolf 报告覆盖本仓的 Core
兼容 adapter,不重复统计 `vendor/` 源码。

每个纳入统计的文件必须达到至少 80% 的 statements、branches、functions 与 lines。报告使用
50% 与 80% 水位线,并输出终端、JSON 摘要与 HTML。唯一的覆盖率豁免是无行为的 package
barrels、CLI 与浏览器启动器、错误声明,以及 Web 的 GSAP 转发边界。不要为满足阈值而新增
豁免、ignore 注释或不可达的兜底测试。

## 浏览器套件隔离

Playwright 规范按产品域分组,可独立运行。并行的 Chromium worker 在 worker 专属命名空间内
创建 Tool、Profile、Character、board 与 Match 记录,并在 teardown 中按依赖顺序移除。设置与
Profile 顺序场景在依赖型的 `chromium-configuration` 项目中运行,使全局变更不与并行场景竞争。

浏览器 server 使用内存型 E2E 数据库。共享的 Match DTO、发言、实时连接、资源与清理 helper
位于 `e2e/fixtures` 下。架构检查拒绝超过 500 行的 E2E 规范。

## 测试数据

- 测试创建唯一命名的 Agent Tools、Profiles、Characters、boards、Matches 与候选。
- 复用 server 的浏览器测试在 teardown 中删除每一条创建的记录(包括断言失败之后),并验证
  不残留测试事件或送达台账。
- 测试绝不复用、重命名、删除或重排用户拥有的运行时记录。
- 运行时数据库、Sessions、生成发言、截图、视频与浏览器轨迹保留在被忽略的 `.agentwolf/` 或
  测试输出目录下。
- 已批准的仿真 fixture 包含脱敏的结构化决策与已审查的语义 oracle,绝不包含凭据、原始
  Prompt、推理、工具输出、运行时路径或源 Match 身份。
- 活动仿真 fixture 只使用 Catalog 当前 Ruleset revision；历史 Match 通过 archive 保留，不进入可执行
  corpus。

## 断言政策

- 断言权威事件、schema、数据库行、协议消息、投影 DTO、渲染 UI 或进程状态。
- 当所拥有的行为破坏时测试必须失败;避免对复制的实现细节或另一个测试的摘要做断言。
- 可见性测试在 server 边界、浏览器呈现之前,练习上帝、行为者、无关玩家、阵营与闭眼投影。
- 并行测试冻结一份行为者 barrier 并证明无完成顺序泄露。恢复测试证明同一 Session ID 与
  已接受动作的对账。
- 模型或用户可见的行文变化检查实际渲染的 Prompt 或浏览器产物,而不只检查源文件存在。

## 验收证据

具体命令与观察结果在请求交接或 CI 中报告。持久 Agent Notes 可以命名稳定的验证契约,但仓库
不存储逐请求的完成计划、带日期的测试总数或重复的验收摘要。
