"""通过 mlx-audio 的已发布模型与流式 Codec 接口合成角色语音。"""

from __future__ import annotations

from collections import OrderedDict
from pathlib import Path

from common import sha256_file
from protocol import Request


class ReferenceContextDecoder:
    def __init__(self, decoder, codes, request: Request, mx):
        self.decoder, self.codes, self.request, self.mx = decoder, codes, request, mx
        self.needs_context = True

    def reset_streaming_state(self):
        self.decoder.reset_streaming_state()
        self.needs_context = True

    def streaming_step(self, codes):
        self.request.check()
        if self.needs_context:
            for start in range(0, self.codes.shape[-1], 25):
                self.request.check()
                reference = self.decoder.streaming_step(
                    self.codes[..., start : start + 25]
                )
                self.mx.eval(reference)
            self.needs_context = False
        self.request.check()
        return self.decoder.streaming_step(codes)

    def __getattr__(self, name):
        return getattr(self.decoder, name)


class MlxEngine:
    def __init__(self, model_path: Path, backend: dict):
        import mlx.core as mx
        import numpy as np
        from mlx_audio.tts.utils import load_model

        self.mx, self.np = mx, np
        mx.set_default_device(mx.gpu)
        self.model = load_model(model_path)
        mx.eval(self.model.parameters())
        if (
            not self.model.speech_tokenizer.has_encoder
            or self.model.speaker_encoder is None
        ):
            raise RuntimeError("Qwen3-TTS Base 缺少音色克隆组件。")
        self.backend = backend
        self.references = OrderedDict()

    def reference(self, request: Request):
        import soundfile as sf
        from mlx_audio.utils import load_audio

        info = sf.info(request.reference)
        if not 0.2 <= info.duration <= 60:
            raise ValueError("参考音频长度必须为 0.2–60 秒。")
        key = (sha256_file(request.reference), request.reference_text)
        if key in self.references:
            self.references.move_to_end(key)
            return self.references[key]
        request.check()
        wave = load_audio(str(request.reference), sample_rate=24_000)
        if not self.np.isfinite(self.np.asarray(wave)).all():
            raise ValueError("参考音频包含非有限值。")
        codes = self.model.speech_tokenizer.encode(wave[None, None, :])
        self.mx.eval(codes)
        request.check()
        self.references[key] = (wave, codes)
        if len(self.references) > 16:
            self.references.popitem(last=False)
            self.model._icl_cache.clear()
        return wave, codes

    def stream(self, request: Request):
        request.check()
        wave, codes = self.reference(request)
        core = self.model.speech_tokenizer.decoder
        self.model.speech_tokenizer.decoder = ReferenceContextDecoder(
            core, codes, request, self.mx
        )
        maximum = min(8192, max(256, len(request.text) * 8 + 128))
        self.mx.random.seed(request.seed % (2**32))
        stream = None
        tokens = 0
        try:
            stream = self.model.generate(
                text=request.text,
                ref_audio=wave,
                ref_text=request.reference_text,
                lang_code="chinese",
                temperature=0.9,
                top_k=50,
                top_p=1.0,
                repetition_penalty=1.5,
                max_tokens=maximum,
                stream=True,
                streaming_interval=0.5,
                verbose=False,
            )
            for result in stream:
                request.check()
                if result.sample_rate != 24_000:
                    raise RuntimeError("模型输出采样率不匹配。")
                self.mx.eval(result.audio)
                tokens += result.token_count
                yield (
                    self.np.asarray(result.audio, dtype=self.np.float32)
                    .reshape(-1)
                    .copy()
                )
            if tokens >= maximum:
                raise RuntimeError("语音生成达到长度上限，结果不完整。")
        finally:
            if stream is not None:
                stream.close()
            self.model.speech_tokenizer.decoder = core
            core.reset_streaming_state()
            self.mx.clear_cache()

    def resources(self):
        return {
            "device": self.mx.device_info()["device_name"],
            "activeBytes": self.mx.get_active_memory(),
            "peakBytes": self.mx.get_peak_memory(),
            "references": len(self.references),
        }

    def close(self):
        self.references.clear()
        del self.model
        self.mx.clear_cache()
