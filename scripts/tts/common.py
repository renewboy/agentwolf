"""TTS 准备与推理进程共用的路径、清单和校验。"""

from __future__ import annotations

import hashlib
import json
import os
import platform
import sys
from pathlib import Path

SPEC_PATH = Path(__file__).with_name("assets-manifest.json")
MODEL_DIRECTORY = Path("models/qwen3-tts-0.6b")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_spec() -> dict:
    return json.loads(SPEC_PATH.read_text())


def spec_digest() -> str:
    return sha256_file(SPEC_PATH)


def selected_models(spec: dict, runtime: str) -> list[dict]:
    return [model for model in spec["models"] if model["runtime"] == runtime]


def configure_paths(data_dir: Path) -> Path:
    data_dir = data_dir.expanduser().resolve()
    runtime = data_dir / "tts-runtime"
    environment = {
        "HF_HOME": runtime / "huggingface",
        "HF_HUB_CACHE": runtime / "huggingface/hub",
        "HF_MODULES_CACHE": runtime / "hf-modules",
        "XDG_CACHE_HOME": data_dir / "cache",
        "TORCH_HOME": data_dir / "cache/torch",
        "TORCHINDUCTOR_CACHE_DIR": data_dir / "cache/torchinductor",
        "TMPDIR": runtime / "tmp",
    }
    for key, value in environment.items():
        value.mkdir(parents=True, exist_ok=True)
        os.environ[key] = str(value)
    os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"
    os.environ["TOKENIZERS_PARALLELISM"] = "false"
    sys.dont_write_bytecode = True
    return data_dir


def require_supported_platform() -> None:
    supported = {
        ("Darwin", "arm64"),
        ("Linux", "x86_64"),
        ("Linux", "aarch64"),
        ("Windows", "AMD64"),
    }
    if (platform.system(), platform.machine()) not in supported or sys.version_info[
        :2
    ] != (3, 12):
        raise RuntimeError("TTS 需要受支持的 64 位平台和 Python 3.12 预编译运行时。")


def atomic_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + f".{os.getpid()}.tmp")
    try:
        with temporary.open("w") as output:
            json.dump(value, output, ensure_ascii=False, indent=2)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def matches_source(path: Path, expected: dict) -> bool:
    if not path.is_file() or path.stat().st_size != expected["size"]:
        return False
    if "sha256" in expected:
        return sha256_file(path) == expected["sha256"]
    content = path.read_bytes()
    blob = b"blob " + str(len(content)).encode() + b"\0" + content
    return hashlib.sha1(blob).hexdigest() == expected["gitBlobSha1"]


def validate_ready(data_dir: Path, *, hash_files: bool = True) -> dict:
    root = data_dir / MODEL_DIRECTORY
    manifest = json.loads((root / "ready.json").read_text())
    if (
        manifest.get("schemaVersion") != 1
        or manifest.get("specSha256") != spec_digest()
    ):
        raise ValueError("TTS 模型清单版本不匹配，请重新运行准备命令。")
    expected = {
        str(Path(model["directory"]) / item["path"])
        for model in selected_models(load_spec(), manifest["runtime"])
        for item in model["files"]
    }
    if set(manifest.get("files", {})) != expected:
        raise ValueError("TTS 模型清单缺少运行时文件。")
    for relative, info in manifest["files"].items():
        path = root / relative
        if not path.is_file() or path.stat().st_size != info["size"]:
            raise ValueError(f"TTS 模型文件不完整：{relative}")
        if hash_files and sha256_file(path) != info["sha256"]:
            raise ValueError(f"TTS 模型校验失败：{relative}")
    return manifest
