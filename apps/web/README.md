# AgentWolf Web 客户端

`@agentwolf/web` 是 React/Vite 呈现应用,覆盖 setup、settings、lobby、实时 Match、赛后复盘与
loopback 开发者工作流。

## 职责

- 通过 `src/api.ts` 消费并校验 REST/WebSocket DTO。
- 在 pages 中组合产品流程,在 components 中沉淀可复用行为。
- 在 hooks 中持有浏览器生命周期与外部副作用。
- 呈现可见性安全的玩家状态、发言、events、votes、复盘、轨迹与仿真。
- 执行语义 Role 效果与浏览器发言播放,不影响游戏时序。

技术边界定义在 [Web 客户端架构](../../docs/architecture/web-client.md),视觉契约在
[前端方向](../../docs/frontend.md)。

## Ownership 模型

- Pages 负责组合 routing 与产品流程。
- Components 持有可复用的交互与渲染。
- Hooks 持有 WebSocket、speech、motion 偏好、Profile 排序及其他浏览器副作用。
- `src/motion/gsap.ts` 是唯一的 GSAP import 边界。

游戏规则、持久化、Prompt 渲染、隐藏字段过滤与 Match 编排留在 server。浏览器从不将本地隐藏
视为授权。

## 交互归属

`GameSelect`、`ConfirmDialog` 与 `ModalDialog` 持有共享的选区与模态实现。

Match 文档固定于视口,中央 feed 持有历史滚动。瞬时重连保留最后的有效快照。已结束与不可用的
Match 依据 server 状态收敛,不做无界重试。

## 验证

DTO 或资产集成变更时对应用进行 typecheck 与构建。浏览器测试持有可见流程、键盘/焦点行为、
响应式布局、实时重连、播放与 motion 清理。保持测试 fixture 带命名空间,并证明 teardown 移除
每一条创建的运行时记录。
