"""通过已发布的 Qwen Python 运行时使用 PyTorch 加速器或 CPU。"""

from __future__ import annotations

from collections import OrderedDict
from pathlib import Path

from common import sha256_file
from protocol import Request


class TorchEngine:
    def __init__(self, model_path: Path, backend: dict):
        import numpy as np
        import torch
        from qwen_tts import Qwen3TTSModel

        self.np, self.torch, self.backend = np, torch, dict(backend)
        dtype = getattr(torch, backend["precision"])
        if backend["engine"] == "faster-qwen3-tts":
            from faster_qwen3_tts import FasterQwen3TTS

            self.model = FasterQwen3TTS.from_pretrained(
                str(model_path),
                device=backend["device"],
                dtype=dtype,
                attn_implementation="sdpa",
                max_seq_len=16_384,
                local_files_only=True,
            )
            self.prompt_model = self.model.model
            self.model.warmup()
        else:
            self.model = Qwen3TTSModel.from_pretrained(
                str(model_path),
                device_map=backend["device"],
                dtype=dtype,
                attn_implementation="sdpa",
                local_files_only=True,
            )
            self.prompt_model = self.model
        self.references = OrderedDict()
        codec = self.prompt_model.model.speech_tokenizer.model
        self.backend["codecPrecision"] = str(
            next(codec.parameters()).dtype
        ).removeprefix("torch.")

    def reference(self, request: Request):
        import soundfile as sf

        info = sf.info(request.reference)
        if not 0.2 <= info.duration <= 60:
            raise ValueError("参考音频长度必须为 0.2–60 秒。")
        key = (sha256_file(request.reference), request.reference_text)
        if key not in self.references:
            request.check()
            audio, rate = sf.read(request.reference, dtype="float32", always_2d=True)
            if not self.np.isfinite(audio).all():
                raise ValueError("参考音频包含非有限值。")
            self.references[key] = self.prompt_model.create_voice_clone_prompt(
                ref_audio=(audio.mean(axis=1), rate),
                ref_text=request.reference_text,
                x_vector_only_mode=False,
            )
            if len(self.references) > 16:
                self.references.popitem(last=False)
        self.references.move_to_end(key)
        request.check()
        return self.references[key]

    def stream(self, request: Request):
        from transformers import StoppingCriteria, StoppingCriteriaList

        prompt = self.reference(request)
        self.torch.manual_seed(request.seed)
        maximum = min(8192, max(256, len(request.text) * 8 + 128))
        kwargs = {
            "text": request.text,
            "language": "Chinese",
            "ref_text": request.reference_text,
            "voice_clone_prompt": prompt,
            "max_new_tokens": maximum,
            "temperature": 0.9,
            "top_k": 50,
            "top_p": 1.0,
            "repetition_penalty": 1.5,
        }
        if self.backend["streaming"]:
            stream = self.model.generate_voice_clone_streaming(
                **kwargs,
                chunk_size=6,
                append_silence=False,
            )
            samples = 0
            try:
                for audio, rate, _timing in stream:
                    request.check()
                    if rate != 24_000:
                        raise RuntimeError("模型输出采样率不匹配。")
                    chunk = self.np.asarray(audio, dtype=self.np.float32).reshape(-1)
                    samples += len(chunk)
                    if samples >= (maximum - 1) * 1920:
                        raise RuntimeError("语音生成达到长度上限，结果不完整。")
                    yield chunk
            finally:
                stream.close()
        else:

            class StopRequest(StoppingCriteria):
                def __call__(self, input_ids, scores, **_):
                    request.check()
                    return False

            audio, rate = self.model.generate_voice_clone(
                **kwargs,
                stopping_criteria=StoppingCriteriaList([StopRequest()]),
            )
            request.check()
            if rate != 24_000:
                raise RuntimeError("模型输出采样率不匹配。")
            chunk = self.np.asarray(audio[0], dtype=self.np.float32).reshape(-1)
            if len(chunk) >= (maximum - 1) * 1920:
                raise RuntimeError("语音生成达到长度上限，结果不完整。")
            yield chunk

    def resources(self):
        if self.backend["device"] == "cuda":
            return {
                "device": self.torch.cuda.get_device_name(),
                "activeBytes": self.torch.cuda.memory_allocated(),
                "peakBytes": self.torch.cuda.max_memory_allocated(),
            }
        return {"device": self.backend["device"], "references": len(self.references)}

    def close(self):
        self.references.clear()
        del self.prompt_model, self.model
        if self.backend["device"] == "cuda":
            self.torch.cuda.empty_cache()
