"""验证下载字节进度、文件校验、断点续传及父进程生命期。"""

import hashlib
import http.server
import subprocess
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from prepare import download, prepare


class DownloadTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.content = b"model-data" * 100_000
        self.expected = {"path": "model.bin", "size": len(self.content),
                         "sha256": hashlib.sha256(self.content).hexdigest()}
        self.ranges = []
        owner = self

        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass

            def do_GET(self):
                requested = self.headers.get("Range")
                owner.ranges.append(requested)
                start = int(requested.split("=")[1].split("-")[0]) if requested else 0
                self.send_response(206 if requested else 200)
                if requested:
                    self.send_header("Content-Range", f"bytes {start}-{len(owner.content)-1}/{len(owner.content)}")
                self.send_header("Content-Length", str(len(owner.content)-start))
                self.end_headers()
                self.wfile.write(owner.content[start:])

        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.url = f"http://127.0.0.1:{self.server.server_port}/model.bin"

    def test_interrupted_download_resumes_from_written_bytes(self):
        target = self.root / "model.bin"
        target.with_suffix(".bin.download").write_bytes(self.content[:262_144])
        progress = []
        download(self.url, target, self.expected, lambda stage, size: progress.append((stage, size)))
        self.assertEqual(self.ranges, ["bytes=262144-"])
        self.assertEqual(target.read_bytes(), self.content)
        self.assertIn(("downloading", 262_144), progress)
        self.assertEqual(progress[-1], ("verifying", len(self.content)))
        self.assertFalse(target.with_suffix(".bin.download").exists())

    def test_complete_temporary_file_is_verified_and_reused_without_network(self):
        target = self.root / "model.bin"
        target.with_suffix(".bin.download").write_bytes(self.content)
        download(self.url, target, self.expected)
        self.assertEqual(self.ranges, [])
        self.assertEqual(target.read_bytes(), self.content)

    def test_invalid_complete_file_is_downloaded_and_verified(self):
        target = self.root / "model.bin"
        target.write_bytes(b"x" * len(self.content))
        download(self.url, target, self.expected)
        self.assertEqual(target.read_bytes(), self.content)

    def test_progress_aggregates_existing_files_and_commits_a_complete_manifest(self):
        folder = self.root / "models/qwen3-tts-0.6b/Base"
        folder.mkdir(parents=True)
        (folder / "model.bin").write_bytes(self.content)
        messages = []
        spec = {"models": [{"runtime": "mlx", "directory": "Base", "repository": "test/model",
                            "revision": "fixed", "files": [self.expected]}]}
        with (patch("prepare.require_supported_platform"),
              patch("prepare.detect_backend", return_value={"engine": "mlx-audio", "id": "macos"}),
              patch("prepare.load_spec", return_value=spec)):
            result = prepare(self.root, emit=messages.append)
        self.assertEqual(messages[-1]["progress"], {
            "stage": "verifying", "downloadedBytes": len(self.content), "totalBytes": len(self.content),
        })
        self.assertIn("Base/model.bin", result["files"])
        self.assertTrue((folder.parent / "ready.json").is_file())

    def test_parent_pipe_closure_terminates_preparation(self):
        child = subprocess.Popen(
            [sys.executable, "-c", "from prepare import watch_parent; import time; watch_parent(); print('watching', flush=True); time.sleep(60)"],
            cwd=Path(__file__).parent, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
        )
        try:
            self.assertEqual(child.stdout.readline().strip(), b"watching")
            child.stdin.close()
            self.assertEqual(child.wait(timeout=3), 1)
        finally:
            if child.poll() is None:
                child.kill()
                child.wait()
            child.stdout.close()

    def test_normal_exit_with_parent_pipe_open_does_not_abort_python(self):
        child = subprocess.Popen(
            [sys.executable, "-c", "from prepare import watch_parent; import time; watch_parent(); time.sleep(0.1)"],
            cwd=Path(__file__).parent, stdin=subprocess.PIPE, stderr=subprocess.PIPE,
        )
        try:
            self.assertEqual(child.wait(timeout=5), 0)
            self.assertEqual(child.stderr.read(), b"")
        finally:
            if child.poll() is None:
                child.kill()
                child.wait()
            child.stdin.close()
            child.stderr.close()


if __name__ == "__main__":
    unittest.main()
