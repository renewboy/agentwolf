# AgentWolf Web 客户端

`@agentwolf/web` 是 React/Vite 呈现应用,覆盖 setup、settings、lobby、实时 Match、赛后复盘与
开发者工作流。

## 职责

- 通过 `src/api.ts` 消费并校验 REST/WebSocket DTO。
- 将 AgentWolf wire、View 和 copy 接入 Core Web runtime、React primitives 与 devtools state。
- 在 pages 中组合产品流程,在 components 中沉淀可复用行为。
- 在 hooks 中持有浏览器生命周期与外部副作用。
- 呈现可见性安全的玩家状态、发言、events、votes、复盘与轨迹诊断。
- 提供仿真 candidate 评审与批准工作流。
- 执行语义 Role 效果与浏览器发言播放,不影响游戏时序。

技术边界定义在 [Web 客户端架构](../../docs/architecture/web-client.md),视觉契约在
[前端方向](../../docs/frontend.md)。

## Ownership 模型

- Pages 负责组合 routing 与产品流程。
- Components 组合 Core 无样式交互与 AgentWolf renderer、class names、icons 和 copy。
- Hooks 将产品 adapters 接入 Core live、presentation、follow-latest 与 cue controllers，并持有 motion
  偏好、Profile 排序等产品副作用。
- Match 资源级 provider 持有实时连接、观战视角、语音偏好与 playback controller；对局页和同场轨迹
  页消费同一 session，离开该 Match 时统一释放。
- `src/motion/gsap.ts` 是唯一的 GSAP import 边界。

游戏规则、持久化、Prompt 渲染、隐藏字段过滤与 Match 编排留在 server。浏览器从不将本地隐藏
视为授权。

## 交互归属

`GameSelect`、`ConfirmDialog` 与 `ModalDialog` 为 Core Select/Dialog primitives 提供 AgentWolf 样式、
图标和文案。Trajectory 与 simulation 页面使用 Core devtools state，领域 audit、Session debug 和 Role
metadata 留在本应用。

Match 文档固定于视口,中央 feed 持有历史滚动。瞬时重连保留最后的有效快照。已结束与不可用的
Match 依据 server 状态收敛,不做无界重试。

## Character 语音

Match 资源级 session 将当前 Match 与观战视角交给语音 adapter。Core controller 通过稳定发言 key
和 actor 关联自动句段及手动重播；`api.ts` 请求经 server 校验的可见句段，server 选择 Character 音色。
浏览器按 `audio/L16` 的大端 PCM16 分块解码，在最后音频实际播放结束后回执完成。

PCM/编码音频排程、媒体元素与音量采样由 Core browser adapters 持有；产品 port 持有语音 HTTP
请求、Character 映射、字幕分页和提示。当前输出通过 Core `output` 快照关联稳定发言标识与玩家，
立绘只在实际起播后展示，缓冲时保留当前字幕。立绘呈现器消费独立的 assets 定义，左右站位来自
玩家列分组；播放控制行位于现有状态面板内部，立绘关闭状态关联单次播放标识，手动重播生成新的标识。
素材或图形能力失败保留可读发言和音频完成语义。

模型音频保持原速。server 在每次请求时选择角色模型或默认 Edge TTS。客户端解析响应来源，分别播放
PCM 或 MP3；当前发言保持同一声音，后续请求重新选择已就绪的模型。缺少 Web Audio 时，默认
MP3 使用音频元素播放。默认语音不使用浏览器系统语音。

回退原因以小字显示在对应发言的播放键下方，支持“不再提示”的浏览器持久偏好。此偏好只隐藏正常回退提示，不隐藏
播放失败。用户交互解锁音频；跳过、视图切换和 session 释放会取消请求、待播音频和当前声音。

## 验证

DTO 或资产集成变更时对应用进行 typecheck 与构建。浏览器测试持有可见流程、键盘/焦点行为、
响应式布局、实时重连、播放与 motion 清理。保持测试 fixture 带命名空间,并证明 teardown 移除
每一条创建的运行时记录。
