"""按可用设备选择已发布的 Qwen3-TTS 运行时。"""

from __future__ import annotations

import platform


def choose_backend(
    system: str, machine: str, accelerator: str | None = None, *, bf16: bool = False
) -> dict:
    if system == "Darwin" and machine == "arm64" and accelerator != "cpu":
        return {
            "id": "macos",
            "device": "metal",
            "engine": "mlx-audio",
            "precision": "bfloat16",
            "codecPrecision": "float32",
            "streaming": True,
            "optimization": "mlx",
        }
    if accelerator in ("cuda", "rocm"):
        precision = "bfloat16" if bf16 else "float16"
        return {
            "id": accelerator,
            "device": "cuda",
            "engine": "faster-qwen3-tts",
            "precision": precision,
            "codecPrecision": precision,
            "streaming": True,
            "optimization": "cuda-graphs",
        }
    device = "xpu" if accelerator == "xpu" else "cpu"
    precision = "bfloat16" if device == "xpu" and bf16 else "float32"
    return {
        "id": device,
        "device": device,
        "engine": "qwen-tts",
        "precision": precision,
        "codecPrecision": precision,
        "streaming": False,
        "optimization": "sdpa",
    }


def detect_backend(*, force_cpu: bool = False) -> dict:
    system, machine = platform.system(), platform.machine()
    if force_cpu:
        return choose_backend(system, machine, "cpu")
    if system == "Darwin" and machine == "arm64":
        import mlx.core as mx

        if not mx.metal.is_available():
            raise RuntimeError("MLX Metal 设备不可用。")
        return choose_backend(system, machine)
    import torch

    if torch.cuda.is_available():
        try:
            torch.ones(1, device="cuda").sum().item()
            accelerator = "rocm" if torch.version.hip else "cuda"
            return choose_backend(
                system, machine, accelerator, bf16=torch.cuda.is_bf16_supported()
            )
        except RuntimeError:
            pass
    if hasattr(torch, "xpu") and torch.xpu.is_available():
        try:
            torch.ones(1, device="xpu").sum().item()
            return choose_backend(
                system, machine, "xpu", bf16=torch.xpu.is_bf16_supported()
            )
        except RuntimeError:
            pass
    return choose_backend(system, machine, "cpu")
