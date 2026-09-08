"""下载固定版本的 Qwen3-TTS 权重，按硬件生成运行清单。"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import threading
import time
import urllib.parse
import urllib.request
from pathlib import Path

sys.dont_write_bytecode = True
from common import (
    MODEL_DIRECTORY,
    atomic_json,
    configure_paths,
    load_spec,
    matches_source,
    require_supported_platform,
    selected_models,
    sha256_file,
    spec_digest,
    validate_ready,
)
from hardware import detect_backend

LOG = logging.getLogger("tts-prepare")


def watch_parent() -> None:
    def watch():
        os.read(sys.stdin.fileno(), 1)
        os._exit(1)

    threading.Thread(target=watch, daemon=True).start()


def download(url: str, destination: Path, expected: dict, report=lambda *_: None) -> None:
    report("verifying", destination.stat().st_size if destination.exists() else 0)
    if matches_source(destination, expected):
        report("verifying", expected["size"])
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(destination.name + ".download")
    for attempt in range(3):
        try:
            offset = temporary.stat().st_size if temporary.exists() else 0
            if offset >= expected["size"]:
                if matches_source(temporary, expected):
                    temporary.replace(destination)
                    report("verifying", expected["size"])
                    return
                temporary.unlink()
                offset = 0
            report("downloading", offset)
            headers = {"User-Agent": "AgentWolf-Qwen3-TTS/1"}
            if offset:
                headers["Range"] = f"bytes={offset}-"
            request = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(request, timeout=90) as response:
                partial = response.status == 206
                if partial and not response.headers.get("Content-Range", "").startswith(
                    f"bytes {offset}-"
                ):
                    raise ValueError("下载续传范围不匹配")
                if not partial:
                    offset = 0
                report("downloading", offset)
                with temporary.open("ab" if partial else "wb", buffering=0) as output:
                    for chunk in iter(lambda: response.read(256 * 1024), b""):
                        output.write(chunk)
                        offset += len(chunk)
                        report("downloading", offset)
                    output.flush()
                    os.fsync(output.fileno())
            report("verifying", offset)
            if not matches_source(temporary, expected):
                temporary.unlink(missing_ok=True)
                raise ValueError(f"下载文件校验失败：{destination.name}")
            temporary.replace(destination)
            return
        except Exception:
            if attempt == 2:
                raise
            LOG.warning("下载重试：%s", destination.name)
            time.sleep(attempt + 1)


def prepare(data_dir: Path, *, force_cpu=False, emit=lambda *_: None) -> dict:
    require_supported_platform()
    backend = detect_backend(force_cpu=force_cpu)
    runtime = "mlx" if backend["engine"] == "mlx-audio" else "torch"
    root = data_dir / MODEL_DIRECTORY
    root.mkdir(parents=True, exist_ok=True)
    spec = load_spec()
    models = selected_models(spec, runtime)
    entries = [(model, item) for model in models for item in model["files"]]
    sizes = [
        min(item["size"], target.stat().st_size) if target.is_file() else 0
        for model, item in entries
        for target in [root / model["directory"] / item["path"]]
    ]
    total = sum(item["size"] for _, item in entries)
    last_report = [0.0, None]

    def progress(stage, *, force=False):
        now = time.monotonic()
        if force or stage != last_report[1] or now - last_report[0] >= 0.25:
            emit({"type": "progress", "progress": {
                "stage": stage, "downloadedBytes": sum(sizes), "totalBytes": total,
            }})
            last_report[:] = [now, stage]

    progress("verifying", force=True)
    try:
        ready = validate_ready(data_dir)
        if ready["backend"] == backend:
            LOG.info("模型与后端校验通过：%s", backend["id"])
            return ready
    except (OSError, ValueError, KeyError, TypeError):
        pass
    paths = []
    index = 0
    for model in models:
        for item in model["files"]:
            target = root / model["directory"] / item["path"]
            remote = item.get("remotePath", item["path"])
            url = f"https://huggingface.co/{model['repository']}/resolve/{model['revision']}/{urllib.parse.quote(remote)}"
            if not matches_source(target, item):
                LOG.info("下载模型文件：%s/%s", model["repository"], remote)
            def report(stage, received):
                sizes[index] = min(item["size"], max(0, received))
                progress(stage)

            download(url, target, item, report)
            sizes[index] = item["size"]
            index += 1
            paths.append(target)
    progress("verifying", force=True)
    ready = {
        "schemaVersion": 1,
        "specSha256": spec_digest(),
        "model": "qwen3-tts-0.6b",
        "backend": backend,
        "runtime": runtime,
        "revisions": {model["repository"]: model["revision"] for model in models},
        "files": {
            str(path.relative_to(root)): {
                "size": path.stat().st_size,
                "sha256": sha256_file(path),
            }
            for path in paths
        },
    }
    atomic_json(root / "ready.json", ready)
    return ready


def main() -> int:
    from filelock import FileLock

    parser = argparse.ArgumentParser(description="准备按硬件选择的 Qwen3-TTS 运行时")
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--watch-parent", action="store_true")
    parser.add_argument(
        "--cpu", action="store_true", help="显式使用 CPU，默认自动检测硬件"
    )
    args = parser.parse_args()
    if args.watch_parent:
        watch_parent()
    logging.basicConfig(stream=sys.stderr, level=logging.INFO, format="%(message)s")
    try:
        data_dir = configure_paths(args.data_dir)
        def emit(message):
            print(json.dumps(message, ensure_ascii=False), flush=True)

        emit({"type": "progress", "progress": {
            "stage": "waiting", "downloadedBytes": 0, "totalBytes": 0,
        }})
        with FileLock(data_dir / "tts-runtime/prepare.lock"):
            prepare(data_dir, force_cpu=args.cpu, emit=emit)
        print(
            json.dumps(
                {
                    "type": "ready",
                    "manifest": str(data_dir / MODEL_DIRECTORY / "ready.json"),
                }
            ),
            flush=True,
        )
        return 0
    except Exception as error:
        LOG.exception("TTS 模型准备失败")
        print(
            json.dumps({"type": "error", "message": str(error)}, ensure_ascii=False),
            flush=True,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
