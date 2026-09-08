"""NDJSON 请求校验、排队与按请求 ID 取消。"""

from __future__ import annotations

import json
import queue
import threading
from dataclasses import dataclass
from pathlib import Path

MAX_TEXT_LENGTH = 2000
MAX_INPUT_BYTES = 32768
MAX_QUEUED_REQUESTS = 16


class Cancelled(Exception):
    pass


@dataclass
class Request:
    id: str
    text: str
    reference: Path
    seed: int
    reference_text: str
    cancelled: threading.Event

    def check(self) -> None:
        if self.cancelled.is_set():
            raise Cancelled()


def parse_request(message: dict) -> Request:
    request_id = message.get("id")
    if not isinstance(request_id, str) or not 1 <= len(request_id) <= 128:
        raise ValueError("id 必须是 1–128 字符的字符串。")
    text = message.get("text")
    if not isinstance(text, str) or not text.strip() or len(text) > MAX_TEXT_LENGTH:
        raise ValueError("text 必须包含 1–2000 个字符。")
    reference = message.get("reference")
    if not isinstance(reference, str) or not reference:
        raise ValueError("reference 必须是参考音频路径。")
    reference_text = message.get("referenceText")
    if (
        not isinstance(reference_text, str)
        or not reference_text.strip()
        or len(reference_text) > 4000
    ):
        raise ValueError("referenceText 必须包含 1–4000 个字符。")
    seed = message.get("seed", 42)
    if not isinstance(seed, int) or isinstance(seed, bool) or not 0 <= seed < 2**63:
        raise ValueError("seed 必须是 0–2^63-1 的整数。")
    return Request(
        request_id,
        text.strip(),
        Path(reference).expanduser().resolve(),
        seed,
        reference_text.strip(),
        threading.Event(),
    )


class InputQueue:
    def __init__(self, emit):
        self.emit = emit
        self.queue = queue.Queue(maxsize=MAX_QUEUED_REQUESTS)
        self.requests: dict[str, Request] = {}
        self.lock = threading.Lock()
        self.stopped = threading.Event()

    def accept(self, message: dict) -> None:
        if not isinstance(message, dict):
            raise TypeError("请求必须是 JSON 对象。")
        if message.get("type") == "cancel":
            with self.lock:
                request = self.requests.get(message.get("id"))
                if request:
                    request.cancelled.set()
            return
        request = parse_request(message)
        with self.lock:
            if request.id in self.requests:
                raise ValueError("请求 id 已在处理中。")
            self.requests[request.id] = request
            try:
                self.queue.put_nowait(request)
            except queue.Full:
                del self.requests[request.id]
                raise ValueError("TTS 请求队列已满。") from None

    def complete(self, request: Request) -> None:
        with self.lock:
            self.requests.pop(request.id, None)

    def stop(self) -> None:
        self.stopped.set()
        with self.lock:
            for request in self.requests.values():
                request.cancelled.set()

    def read(self, source) -> None:
        while not self.stopped.is_set():
            line = source.readline(MAX_INPUT_BYTES + 1)
            if not line:
                self.stop()
                return
            message = None
            try:
                if len(line) > MAX_INPUT_BYTES:
                    while line and not line.endswith("\n"):
                        line = source.readline(MAX_INPUT_BYTES + 1)
                    raise ValueError("NDJSON 请求超过长度限制。")
                message = json.loads(line)
                self.accept(message)
            except (ValueError, TypeError) as error:
                request_id = message.get("id") if isinstance(message, dict) else None
                self.emit({"id": request_id, "type": "error", "message": str(error)})
