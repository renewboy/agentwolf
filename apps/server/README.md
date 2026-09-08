# AgentWolf server

`@agentwolf/server` 是应用组合根。它连接 Fastify、SQLite、确定性引擎、Prompt 资产、ACP 玩家
Session、MCP 动作、实时 projection、赛后复盘、轨迹诊断与确定性仿真。

## 职责

- REST 与 WebSocket 路由组装及 schema 校验。
- Agent Tool/Profile、Character、身份牌池 board、settings 与 Match 目录。
- 不可变的 Match 设置、活跃运行时编排、恢复、暂停、继续、只读归档，以及包含持久 Session
  物理清理的删除。
- 用于 events、Session 绑定、delivery、复盘与开发者数据的 SQLite schema 与 repository。
- 可见性安全的视图 projection，以及接入 Core subscription/presentation runtime 的实时连接协调。
- 玩家绑定的 MCP 动作传输、Prompt 上下文适配与 Session 恢复。
- 轨迹采集、读取与语义审计。
- 仿真候选采集、双 runner 评审与 fixture 批准。
- 可见发言的 Character 音色选择、模型准备、流式音频与播放缓存。

跨包设计拆分在[架构模块](../../docs/architecture.md)中。

## Ownership map

- `app.ts`:HTTP 与 WebSocket 组装。
- `repository.ts` 与各聚焦 repository:持久化 SQLite 访问。
- `match-manager.ts`:Match 创建、查找、恢复，以及以 Session/workspace 清理为提交前置条件的删除。
- `match-runtime.ts`:活跃回合编排与 engine/action 边界。
- `arena-runtime-context.ts`:组装 AgentWolf GameModule 与 Core Match/Session runtime。
- `arena-match-turn.ts`:将普通非发言 boundary 交给 Core MatchOrchestrator/ActionGateway。
- `arena-session-store.ts`:将既有 player Session binding repository 适配为 Core store port。
- `match-archive.ts`:终局 spectator projections 与 audit 的规则无关冻结边界。
- `projector.ts`:server 持有的可见性安全 DTO。
- `live-hub.ts` 与 `speech-playback-coordinator.ts`:将 AgentWolf view、wire、speech visibility 和轨迹
  controls 适配到 Core live subscription 与 presentation barrier。
- `speech-audio-routes.ts`:按当前 Match 投影校验发言与原文片段，返回语音状态和音频流。
- `speech-audio-service.ts` 与 `speech-audio-process.ts`:音色物化、异步准备、worker 生命周期、
  请求取消、PCM 格式转换和完整音频缓存。
- `mcp.ts`:玩家绑定的结构化动作传输。
- `player-runtime.ts`:单个逻辑 Session 的 delivery 与恢复。
- `player-session-deletion.ts`:把冻结 binding 转换为 Provider Session 删除请求。
- `postgame-review-coordinator.ts`:复盘倒计时、sheets、聚合与反思。
- `trajectory.ts`:Match Turn 创建、system events、runtime controls 与 revision publication。
- `trajectory-turn-recorder.ts`:将 AgentWolf schemas/repository 适配到 Core Turn/Record recorder。
- `trajectory-service` 与 `trajectory-audit`:读取、projection、实时 delta 与语义审计。
- `simulation*`:AgentWolf capture/canonical/runners 与 Core adapted workflow/fixture 批准。

新行为归属现有最窄的 owner。游戏规则留在 game-engine,通用 ACP 进程行为留在 acp,schema 留在
contracts,模型/UI 呈现留在 assets。

## 外部边界

每条路由都从 contracts 解析请求与响应 schema。SQLite JSON 在 repository 边界解析。浏览器 DTO
不含隐藏字段。开发者 HTTP/WebSocket 路由仅在显式开发者模式下可用。

数据库变更包含前向迁移与迁移覆盖。当前 revision 的运行时恢复从 events 重建引擎并恢复已持久化的
Session ID；终局 archive 直接返回冻结 DTO，不解释事件或启动 Session。

Simulation capture 可以只读消费 paused/ended Match 保留的 snapshot、事件和轨迹，包括已经生成 archive
的终局 Match；它不恢复生产 Session、不修改 archive，并要求 snapshot Ruleset 仍能由当前 catalog 执行。

## 启动配置

`AGENTWOLF_HOST` 控制 HTTP 服务监听地址,默认 `127.0.0.1`。开发者模式可以绑定非回环地址;
开发者路由不提供独立身份验证,因此只应暴露给可信网络。

`AGENTWOLF_PUBLIC_SPEECH_INTERRUPT_MODE` 接受 `legacy` 或 `rolling`,默认 `legacy`。该值只作为
新 Match 默认值并写入 setup snapshot;恢复使用冻结值。A/B 实例使用相同代码时分别配置该变量,
并继续通过独立的端口、公开 URL、数据目录与数据库隔离运行状态。

## 角色语音

`AGENTWOLF_TTS_ENABLED` 接受 `true` 或 `false`，默认 `true`；`false` 禁用本地角色模型准备与推理。
Fastify 在 `onListen` 中启动后台准备，开局与播放请求也会触发未就绪模型的检查。依赖或下载失败后
按重试间隔恢复，HTTP 和对局不等待模型下载。模型未就绪、已停止、被禁用或角色没有参考音色时，
当前请求使用默认 Edge TTS，后续请求优先使用已就绪的 Qwen3-TTS 0.6B。

默认语音固定为 `zh-CN-YunxiNeural`，使用独立的 `.venv-edge` 环境，仅依赖 `edge-tts` 发布包。
`AGENTWOLF_EDGE_TTS_ENABLED=false` 禁用默认在线语音。默认合成只接收校验后的可见文本，通过
标准 CLI 的 stdin 传入，MP3 从 stdout 返回，不向在线服务发送角色参考录音。

服务端支持 macOS arm64、Windows x64、Linux x64/arm64，并需要 `uv`。Python 3.12 环境按平台
隔离，只安装预编译 wheel。Apple Silicon 使用现成 BF16 MLX 权重；CUDA/ROCm 使用社区 GPU
流式运行时。CPU/XPU 使用 Qwen Python API 完整生成，状态接口准确声明增量输出能力。
安装、模型来源与 worker 协议见 [TTS runtime README](../../scripts/tts/README.md)。

模型、Python 环境、依赖下载和缓存均使用 `ServerConfig.dataDirectory`，由
`AGENTWOLF_DATA_DIR` 指定，默认是项目根目录 `.agentwolf`。内置参考音频从
`@agentwolf/assets/voices` 清单读取，按摘要校验后物化到数据目录的 `voice-library/builtin`。
运行日志位于 `tts-runtime/service.log`。共享模型和参考音频不属于某一 Match 的删除范围。

### HTTP 接口

成功响应的 `X-AgentWolf-Speech-Source` 头包含 `SpeechAudioSource` JSON，声明实际 provider、默认音色
与回退原因。角色模型返回 `audio/L16;rate=24000;channels=1`，默认语音返回 `audio/mpeg`。
请求中的 `preferDefault` 用于不支持 Web Audio 的客户端。默认语音失败返回 `tts-default-unavailable`；
发言不可见或原文不匹配在任何合成前被拒绝。

| 接口                                 | 输入与结果                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `GET /api/speech-audio/status`       | 返回 `SpeechAudioStatus`，包含 `disabled/preparing/loading/ready/error` 状态、模型标识、音色数量及说明 |
| `POST /api/matches/:id/speech-audio` | 接收 `SpeechAudioRequest` 的 `speechId`、`view` 和原文 `text`；根据所选后端返回 PCM 或 MP3             |

请求与状态 schema 由 [contracts](../../packages/contracts/src/speech-audio.ts) 拥有。`text` 为
1–2000 字符，必须包含于同一 `speechId` 的当前可见原文中；角色从该发言所属的 Match Seat
确定。请求不能指定 Character 或参考文件路径。未通过输入 schema 的请求遵循通用 HTTP 输入
错误处理。

| HTTP 状态 | 错误码                      | 含义                                 |
| --------- | --------------------------- | ------------------------------------ |
| 400       | `speech-audio-invalid-text` | 请求文本不属于这段发言的可见原文     |
| 404       | `speech-audio-not-visible`  | 当前视图没有这段发言                 |
| 503       | `tts-default-unavailable`   | 默认在线语音不可用，无法完成本次播报 |

角色音频为大端 PCM16、24 kHz、单声道，不带 WAV 容器；默认音频为 MP3。响应使用 `Cache-Control: private, no-store`；
server 的完整音频缓存位于请求可见性校验之后，不提供公开静态 URL。正常 EOF 表示所选后端已完整结束；角色 worker 还需要样本总数校验通过，流式生成错误会中断响应。客户端断开会取消对应生成请求。

删除 Match 成功后调用语音服务清除该 Match 的音频缓存；server 关闭时终止准备进程与 worker，
释放所有内存缓存。缓存边界、播放完成和取消的跨层所有权见
[角色语音架构](../../docs/architecture/speech-audio.md)。

## 验证

单元/集成测试使用内存 repository 与假 ACP 进程,除非测试明确位于 `tests/live` 下。路由字段获得
集成覆盖;跨包行为经由根级门禁运行。用户可见流程额外接受浏览器验收。
