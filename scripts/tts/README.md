# Qwen3-TTS 角色语音运行时

运行时使用 Qwen3-TTS 0.6B Base 与角色参考音频、对应对白进行音色克隆。Python worker 通过
NDJSON 交付单声道 24 kHz PCM。模型、依赖和下载归属 server 的数据目录，默认 `.agentwolf`。

## 平台与依赖

| 服务端          | 推理运行时                           | 精度                                 | 音频输出能力   |
| --------------- | ------------------------------------ | ------------------------------------ | -------------- |
| macOS arm64     | mlx-audio，Metal                     | BF16 模型、FP32 Codec                | 增量生成       |
| CUDA / ROCm     | faster-qwen3-tts，PyTorch GPU 图执行 | 设备支持 BF16 时使用 BF16，否则 FP16 | 增量生成       |
| CPU / Intel XPU | 配套 Qwen Python API，SDPA           | CPU 为 FP32，XPU 支持时使用 BF16     | 完整生成后返回 |

服务端支持 Windows x64、Linux x64/arm64、macOS arm64，需要 `uv` 和 Python 3.12。依赖清单
固定已发布的 wheel；安装使用 `--only-binary=:all:`，不执行本机源码构建。Windows/Linux 使用
`uv --torch-backend auto` 选择 PyTorch 发行版，安装失败时尝试 CPU wheel。运行时再探测实际设备。

Apple Silicon 使用 `requirements-macos.txt`，其他平台使用 `requirements-portable.txt`。
`faster-qwen3-tts` 与其配套 `qwen-tts-hf` 提供 PyTorch 模型 API，后者维护 Transformers 版本适配。
运行状态中的 `streaming` 指增量推理能力；NDJSON 或 HTTP 分块不改变完整生成后端的能力。

## 准备与启动

server 在开始监听后自动检查、下载与加载，开局和语音请求会再次触发未就绪模型的准备。失败重试
具有间隔，HTTP 和对局不等待下载。Mac 手动准备示例：

```sh
mkdir -p .agentwolf/tts-runtime/tmp
export UV_CACHE_DIR="$PWD/.agentwolf/tts-runtime/uv-cache"
export UV_PYTHON_INSTALL_DIR="$PWD/.agentwolf/tts-runtime/python"
export TMPDIR="$PWD/.agentwolf/tts-runtime/tmp"
uv venv --python 3.12 .agentwolf/tts-runtime/.venv-qwen-macos
uv pip install --only-binary=:all: --python .agentwolf/tts-runtime/.venv-qwen-macos/bin/python -r scripts/tts/requirements-macos.txt
.agentwolf/tts-runtime/.venv-qwen-macos/bin/python scripts/tts/prepare.py --data-dir .agentwolf
.agentwolf/tts-runtime/.venv-qwen-macos/bin/python scripts/tts/runtime.py --data-dir .agentwolf
```

`assets-manifest.json` 固定模型 repository、revision、文件尺寸与摘要。MLX 权重直接使用社区发布物；
PyTorch 权重来自 Qwen 模型仓库。准备命令仅下载当前后端所需文件，支持校验后的复用与断点续传，
全部校验通过后原子写入完成清单。`--cpu` 为独立验证或明确指定 CPU 的准备入口。

| 数据目录下的路径                   | 内容                       |
| ---------------------------------- | -------------------------- |
| `models/qwen3-tts-0.6b/Base-bf16`  | MLX BF16 模型与配套 Codec  |
| `models/qwen3-tts-0.6b/Base-torch` | Qwen 原始模型与配套 Codec  |
| `models/qwen3-tts-0.6b/ready.json` | 文件校验与已选择的后端     |
| `tts-runtime/.venv-qwen-macos`     | Mac Python 环境            |
| `tts-runtime/.venv-qwen-portable`  | Windows/Linux Python 环境  |
| `voice-library/builtin`            | 已校验并物化的内置参考音频 |
| `tts-runtime/service.log`          | 准备、后端、资源与请求日志 |

## Worker 协议

stdin 和 stdout 均为逐行 JSON，诊断日志写入 stderr。启动成功输出 `ready` 与实际 `backend`；
启动失败输出不带请求 `id` 的 `error` 并退出。准备命令的 `ready` 包含完成清单路径 `manifest`。

请求：

```json
{
  "id": "speech-1",
  "text": "请把时间线说清楚。",
  "reference": "/absolute/reference.flac",
  "referenceText": "参考录音里实际说出的内容。",
  "seed": 42
}
```

`id` 为 1–128 字符，`text` 为 1–2000 字符，`referenceText` 为 1–4000 字符。参考录音范围
为 0.2–60 秒；多声道转单声道并重采样。`seed` 为 0–2^63-1 整数，默认 42。

响应：

```json
{"id":"speech-1","type":"meta","sampleRate":24000,"channels":1,"format":"pcm_s16le"}
{"id":"speech-1","type":"audio","sequence":0,"pcm":"base64 编码的 PCM16LE"}
{"id":"speech-1","type":"done","frames":24000}
```

`sequence` 从 0 连续递增；`frames` 为全部 PCM 采样点数。只有 `done` 表示完整结果。错误返回
同一请求的 `error`，不能将先前分块视为完整音频。传输单块最多包含一秒音频。

发送 `{"type":"cancel","id":"speech-1"}` 取消当前或排队请求。worker 在安全的生成或解码边界
停止、清理请求状态并输出 `cancelled`。不存在的请求取消为空操作；客户端立即停止自身音频排程，
忽略在途的迟到分块。stdin 结束或终止信号会关闭队列与模型。

## 生成与资源

模型权重在进程内共享。参考特征按录音摘要和对白组成的键缓存，最多十六项；参考特征不写入游戏
事件或公开静态资源。输入参考由 server 的内置音色清单选择，worker 不接收浏览器提供的文件路径。

MLX 使用发布包的 `generate(stream=True)`，每六个音频 Token 输出约 0.48 秒声音。流式 Codec
在首包前分批解码当前角色参考 Token 来建立上下文，每批最多二十五个 Token；参考重建音频被丢弃。
每次生成的结束与取消均恢复解码器、清空流式状态和临时张量缓存，后续请求使用独立生成状态。

生成参数使用 temperature 0.9、top-k 50、top-p 1.0，ICL repetition penalty 为 1.5。生成上限
随文本长度增长，最高 8192 个音频 Token。达到上限或产生非有限音频时报告请求失败。

stderr 的 `tts-backend` 日志记录实际后端、精度、优化方式和流式能力，`tts-resources` 记录设备、
参考缓存项数和分配内存。MLX/设备内存不能与进程 RSS 相加，也不等同于整进程物理占用。

## 验证

```sh
PYTHONDONTWRITEBYTECODE=1 .agentwolf/tts-runtime/.venv-qwen-macos/bin/python -m unittest discover -s scripts/tts -p 'test_*.py'
```

协议验证覆盖输入、文件完整性、平台能力、参考上下文和取消。真实模型验收检查 PCM 连续性、
完整结束、取消后的下一次生成及浏览器播放；硬件实测结论按实际设备分别记录。

## 默认语音

`requirements-edge.txt` 固定 `edge-tts` 发布包。server 自动创建数据目录下的 `tts-runtime/.venv-edge`，
与角色模型环境独立。默认音色为 `zh-CN-YunxiNeural`，通过标准 CLI `python -u -m edge_tts --file -
--voice zh-CN-YunxiNeural` 接收 stdin 文本、输出 MP3，不需要本地模型或 API key。在线合成需要网络。

每个默认语音请求拥有独立进程与取消信号。进程必须成功结束且产生音频，响应才正常完成；删除
Match、取消播放和服务关闭会终止对应的默认语音请求。默认语音不参与角色模型的 PCM worker 协议。
