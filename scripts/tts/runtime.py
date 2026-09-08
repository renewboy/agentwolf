"""角色语音 worker：模型初始化、NDJSON PCM、取消和资源回收。"""

from __future__ import annotations

import argparse
import base64
import contextlib
import json
import logging
import queue
import signal
import sys
import threading
from pathlib import Path

sys.dont_write_bytecode = True
from common import (
    MODEL_DIRECTORY,
    configure_paths,
    load_spec,
    selected_models,
    validate_ready,
)
from protocol import Cancelled, InputQueue

LOG = logging.getLogger("tts-worker")
SAMPLE_RATE = 24_000


def load_engine(data_dir: Path):
    manifest = validate_ready(data_dir)
    model = selected_models(load_spec(), manifest["runtime"])[0]
    model_path = data_dir / MODEL_DIRECTORY / model["directory"]
    if manifest["runtime"] == "mlx":
        from mlx_engine import MlxEngine

        engine = MlxEngine(model_path, manifest["backend"])
    else:
        from torch_engine import TorchEngine

        engine = TorchEngine(model_path, manifest["backend"])
    LOG.info("tts-backend %s", json.dumps(engine.backend, ensure_ascii=False))
    LOG.info("tts-resources %s", json.dumps(engine.resources(), ensure_ascii=False))
    return engine


def main() -> int:
    parser = argparse.ArgumentParser(description="Qwen3-TTS 角色语音 NDJSON worker")
    parser.add_argument("--data-dir", type=Path, required=True)
    args = parser.parse_args()
    logging.basicConfig(stream=sys.stderr, level=logging.INFO, format="%(message)s")
    protocol_output = sys.stdout
    sys.stdout = sys.stderr
    output_lock = threading.Lock()

    def emit(message):
        with output_lock:
            protocol_output.write(
                json.dumps(message, ensure_ascii=False, separators=(",", ":")) + "\n"
            )
            protocol_output.flush()

    engine = None
    inputs = InputQueue(emit)
    for name in (signal.SIGTERM, signal.SIGINT):
        signal.signal(name, lambda *_: inputs.stop())
    try:
        data_dir = configure_paths(args.data_dir)
        engine = load_engine(data_dir)
        emit({"type": "ready", "backend": engine.backend})
        threading.Thread(target=inputs.read, args=(sys.stdin,), daemon=True).start()
        while not inputs.stopped.is_set():
            try:
                request = inputs.queue.get(timeout=0.1)
            except queue.Empty:
                continue
            try:
                request.check()
                emit(
                    {
                        "id": request.id,
                        "type": "meta",
                        "sampleRate": SAMPLE_RATE,
                        "channels": 1,
                        "format": "pcm_s16le",
                    }
                )
                samples = 0
                sequence = 0
                with contextlib.closing(engine.stream(request)) as stream:
                    for audio in stream:
                        request.check()
                        if not engine.np.isfinite(audio).all():
                            raise RuntimeError("生成音频包含非有限值。")
                        if not len(audio):
                            continue
                        for start in range(0, len(audio), SAMPLE_RATE):
                            request.check()
                            part = audio[start : start + SAMPLE_RATE]
                            pcm = (
                                (engine.np.clip(part, -1, 1) * 32767)
                                .astype("<i2")
                                .tobytes()
                            )
                            emit(
                                {
                                    "id": request.id,
                                    "type": "audio",
                                    "sequence": sequence,
                                    "pcm": base64.b64encode(pcm).decode("ascii"),
                                }
                            )
                            samples += len(part)
                            sequence += 1
                request.check()
                LOG.info(
                    "tts-resources %s",
                    json.dumps(engine.resources(), ensure_ascii=False),
                )
                if samples == 0:
                    raise RuntimeError("模型没有生成音频。")
                emit({"id": request.id, "type": "done", "frames": samples})
            except Cancelled:
                emit({"id": request.id, "type": "cancelled"})
            except Exception as error:
                LOG.exception("TTS 请求失败：%s", request.id)
                emit({"id": request.id, "type": "error", "message": str(error)})
            finally:
                inputs.complete(request)
        return 0
    except Exception as error:
        LOG.exception("TTS worker 启动失败")
        emit({"type": "error", "message": str(error)})
        return 1
    finally:
        inputs.stop()
        if engine:
            engine.close()


if __name__ == "__main__":
    raise SystemExit(main())
