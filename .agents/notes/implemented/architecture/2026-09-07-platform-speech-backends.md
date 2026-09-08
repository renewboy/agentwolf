# Agent Note: 按平台选择角色语音推理后端

Status: implemented

## Problem

角色语音使用 Qwen3-TTS 0.6B Base，模型与参考音色需要在服务端后台准备，并根据设备选择已发布的运行时。

## Decision

- Apple Silicon 使用 mlx-audio 与现成 BF16 MLX 权重，以参考上下文初始化流式音频解码。
- CUDA 与 ROCm 使用 faster-qwen3-tts 的 GPU 流式接口；CPU 与 XPU 使用配套 Qwen Python API。
- 后端状态准确报告设备、精度、优化方式和是否增量输出音频。CPU 与 XPU 的完整生成返回不标为流式推理。
- Python 依赖只安装 wheel，模型使用固定 revision 与文件摘要，运行数据归属 `.agentwolf`。
- 本地模型未就绪时使用 Edge TTS 默认在线语音，后续请求优先使用就绪的角色模型。

## Consequences

各后端共用参考音频、对应文字、可见性校验、取消协议与 PCM 传输。模型和角色版本进入缓存标识。
首段解码使用参考音频的上下文，参考重建声音不进入输出。跨平台硬件实测与逻辑验证分别记录。

## Verification

验证真实 Mac PCM、取消后的下一次生成、历史播放，以及平台选择、下载校验和服务端协议边界。

## Alternatives considered

- 所有平台使用同一 PyTorch 接口，部署结构简单，但不能使用 Apple Silicon 已验证的 MLX 增量输出。
- 自建推理内核可以统一接口，但增加平台维护成本；此方案使用已发布的运行时。

## 运行边界

设备支持、驱动和可用内存会影响 GPU 图执行。模型加载失败必须明确报告；增量能力和硬件实测范围
需要准确区分。参考录音与对白不匹配会影响克隆质量，需要保留素材校验与试听结果。
