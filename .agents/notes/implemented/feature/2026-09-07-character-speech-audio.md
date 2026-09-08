# Agent Note: Character 音色与流式发言播放

Status: implemented

## Problem

Character 使用各自的参考音色播报可见发言。语音准备和生成具有独立的进程与资源生命周期，同时
需要服从 Match 的可见性、单窗口播放控制、跳过、历史重播与实际播放完成回执。

## Decision

- assets 拥有十二位 Character 的参考 FLAC、来源与内容版本，通过专属 server 入口提供清单。
- server 启动后异步准备 Python 环境和模型。HTTP 服务不等待准备；模型、依赖、下载、临时文件与
  参考编码缓存使用 `ServerConfig.dataDirectory`，默认位于当前仓库 `.agentwolf`。
- 角色模型为 Qwen3-TTS 0.6B Base。Apple Silicon 使用现成 BF16 MLX 权重与流式运行时；其他
  平台根据硬件选择已发布的 Python 推理后端。状态明确声明设备、精度与增量输出能力。
- 模型权重共享，每次请求隔离生成、解码和取消状态。MLX 首包解码携带参考音频上下文。
- server 重新投影请求视图，按 SpeechId 验证可见原文句段并从 Seat Character 选择音色。生成结果
  缓存位于校验之后，缓存命中同样不能绕过视图边界。
- HTTP 使用 `audio/L16;rate=24000;channels=1` 大端 PCM16；浏览器按块排程音频，只有正常 EOF
  且全部音频节点实际结束后才报告完成。Core PlaybackPort 只承担通用 actor/key 上下文。
- 模型音频按原速播放，模型未就绪或缺少音色时使用默认在线语音。权限和文本校验失败直接终止
  播放。回退提示以小字呈现在对应发言的播放键下方，支持浏览器持久隐藏偏好；已发声的流失败不重新朗读整句。
- 取消沿浏览器、Node 请求队列和 Python worker 传播。删除 Match 清理其音频传输与缓存；服务关闭
  先终止准备进程、worker 和音频流，再等待 HTTP 连接结束。

## Alternatives considered

- 浏览器系统语音的运行环境要求较低，但不能提供内置 Character 的参考音色。
- 完整 WAV 返回便于播放器消费，但必须等整段音频生成后才能开始播放。
- 自定义 native 桥接库和用户机器现场编译增加发布依赖，不采用。

## Consequences

语音生成位于呈现层，不改变游戏规则或持久事件。安装依赖与模型准备在后台进行，用户可通过播放
提示观察准备状态。新音色通过参考资产和版本清单扩展；自定义 Character 没有对应音色时使用默认在线语音。

生成音频使用有界的 server 内存缓存，参考特征使用进程内的有界缓存。正常完成、取消、进程
失败、视图切换和 Match 删除均有明确的状态所有者与清理路径。

## Verification

协议测试验证消息身份、PCM 格式、分块顺序、背压、取消及进程关闭；路由测试验证视图过滤、原文
限制和缓存前校验。浏览器测试验证真实 AudioContext 排程、EOF 与实际 ended 的完成条件以及系统
语音边界。真实模型验收覆盖分块 HTTP 音频、取消后的下一角色和浏览器播放。

职责与完整流程见[角色语音架构](../../../../docs/architecture/speech-audio.md)，运行命令与进程
协议见[TTS runtime](../../../../scripts/tts/README.md)。
