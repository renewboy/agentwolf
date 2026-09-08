"""验证后端能力声明与参考上下文、取消的协议边界。"""

import threading
import unittest
from pathlib import Path

from hardware import choose_backend
from mlx_engine import ReferenceContextDecoder
from protocol import Cancelled, Request, parse_request


class ModelBackendTests(unittest.TestCase):
    def test_macos_uses_bf16_mlx_streaming(self):
        plan = choose_backend("Darwin", "arm64")
        self.assertEqual(
            (plan["engine"], plan["device"], plan["precision"]),
            ("mlx-audio", "metal", "bfloat16"),
        )
        self.assertTrue(plan["streaming"])

    def test_gpu_and_cpu_capabilities_are_distinguished(self):
        for accelerator in ["cuda", "rocm"]:
            with self.subTest(accelerator=accelerator):
                plan = choose_backend("Linux", "x86_64", accelerator, bf16=True)
                self.assertEqual(plan["optimization"], "cuda-graphs")
                self.assertTrue(plan["streaming"])
        for accelerator in ["cpu", "xpu"]:
            plan = choose_backend("Windows", "AMD64", accelerator, bf16=True)
            self.assertFalse(plan["streaming"])
            self.assertEqual(plan["engine"], "qwen-tts")
        self.assertEqual(choose_backend("Darwin", "arm64", "cpu")["device"], "cpu")
        self.assertEqual(
            choose_backend("Linux", "x86_64", "cuda")["precision"], "float16"
        )

    def test_reference_transcript_is_required_at_the_process_boundary(self):
        message = {"id": "a", "text": "台词", "reference": "/tmp/ref.flac"}
        for text in [None, "", " ", "我" * 4001]:
            with (
                self.subTest(text_type=type(text).__name__),
                self.assertRaises(ValueError),
            ):
                parse_request({**message, "referenceText": text})

    def test_reference_audio_is_not_emitted_and_cancellation_interrupts_prefill(self):
        class Codes:
            shape = (1, 16, 62)

            def __getitem__(self, key):
                return (
                    key[-1].stop - key[-1].start
                    if key[-1].stop < 62
                    else 62 - key[-1].start
                )

        class Core:
            def __init__(self):
                self.calls = []

            def reset_streaming_state(self):
                self.calls.clear()

            def streaming_step(self, value):
                self.calls.append(value)
                return value

        class Mx:
            @staticmethod
            def eval(value):
                pass

        request = Request(
            "a", "台词", Path("/tmp/reference.flac"), 42, "参考", threading.Event()
        )
        core = Core()
        decoder = ReferenceContextDecoder(core, Codes(), request, Mx)
        self.assertEqual(decoder.streaming_step(6), 6)
        self.assertEqual(core.calls, [25, 25, 12, 6])
        self.assertEqual(decoder.streaming_step(6), 6)
        self.assertEqual(core.calls, [25, 25, 12, 6, 6])
        decoder.reset_streaming_state()
        request.cancelled.set()
        with self.assertRaises(Cancelled):
            decoder.streaming_step(6)
        self.assertEqual(core.calls, [])
