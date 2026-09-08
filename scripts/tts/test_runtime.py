"""验证请求隔离、取消边界与模型文件完整性。"""

from __future__ import annotations

import hashlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from common import matches_source
from protocol import Cancelled, InputQueue, parse_request


class RequestTests(unittest.TestCase):
    def message(self, request_id="a", text="请继续发言。"):
        return {
            "id": request_id,
            "text": text,
            "reference": "/tmp/reference.wav",
            "seed": 42,
            "referenceText": "这是参考音频的文字。",
        }

    def test_cancel_only_marks_matching_request(self):
        messages = []
        requests = InputQueue(messages.append)
        requests.accept(self.message("first"))
        requests.accept(self.message("next"))
        requests.accept({"type": "cancel", "id": "first"})
        first = requests.queue.get_nowait()
        second = requests.queue.get_nowait()
        with self.assertRaises(Cancelled):
            first.check()
        second.check()
        requests.complete(first)
        self.assertEqual(set(requests.requests), {"next"})

    def test_accepts_full_history_text_and_rejects_over_limit(self):
        request = parse_request(self.message(text="我" * 2000))
        self.assertEqual(len(request.text), 2000)
        with self.assertRaises(ValueError):
            parse_request(self.message(text="我" * 2001))

    def test_duplicate_request_does_not_replace_cancel_target(self):
        requests = InputQueue(lambda _: None)
        requests.accept(self.message())
        first = requests.requests["a"]
        with self.assertRaises(ValueError):
            requests.accept(self.message())
        self.assertIs(requests.requests["a"], first)

    def test_invalid_line_does_not_prevent_following_request(self):
        messages = []
        requests = InputQueue(messages.append)
        source = io.StringIO("bad-json\n" + json.dumps(self.message()) + "\n")
        requests.read(source)
        self.assertEqual(messages[0]["type"], "error")
        self.assertEqual(requests.queue.get_nowait().id, "a")

    def test_shutdown_cancels_active_and_queued_requests(self):
        requests = InputQueue(lambda _: None)
        requests.accept(self.message("a"))
        requests.accept(self.message("b"))
        requests.stop()
        self.assertTrue(
            all(value.cancelled.is_set() for value in requests.requests.values())
        )


class IntegrityTests(unittest.TestCase):
    def test_same_size_corruption_fails_source_hash(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "model"
            path.write_bytes(b"original")
            expected = {"size": 8, "sha256": hashlib.sha256(b"original").hexdigest()}
            self.assertTrue(matches_source(path, expected))
            path.write_bytes(b"modified")
            self.assertFalse(matches_source(path, expected))

    def test_upstream_git_blob_digest_is_verified(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "source.py"
            path.write_bytes(b"pass\n")
            expected = {
                "size": 5,
                "gitBlobSha1": hashlib.sha1(b"blob 5\0pass\n").hexdigest(),
            }
            self.assertTrue(matches_source(path, expected))


if __name__ == "__main__":
    unittest.main()
