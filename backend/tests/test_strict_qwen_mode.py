"""Strict Qwen mode must never return a fixed rewrite or dynamic explanation."""
from __future__ import annotations
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from fastapi import HTTPException
from app.api.learning_lab import what_if, ai_status
from app.models.schemas import WhatIfRequest, WhatIfTransformationRequest
from app.services.local_ai_summary_service import LocalAISettings, get_local_ai_settings


REWRITE = json.dumps({"rewritten_text": "Information about a bank account notification"})
EXPLANATION = json.dumps({
    "explanation": "This comparison shows how revised wording changes the educational example.",
    "practical_tip": "Verify unexpected requests independently through the official service.",
})


class StrictQwenTests(unittest.TestCase):
    def request(self, identifier: str = "subject-wording", include_summary: bool = True):
        return WhatIfRequest(
            email_id="demo-001",
            transformations=[WhatIfTransformationRequest(part="subject", transformation_id=identifier)],
            include_summary=include_summary,
            ai_mode="require_qwen",
        )

    @staticmethod
    def classify(subject, body):
        return {"classification": "Potential threat", "confidence": 80,
                "malicious_probability": 80}

    def test_missing_model_never_falls_back(self):
        with patch.dict("os.environ", {"PHISHLAB_LOCAL_AI_ENABLED": "0"}), patch(
            "app.services.learning_lab_service.classify_email_detailed", side_effect=self.classify
        ):
            with self.assertRaises(HTTPException) as err:
                what_if(self.request())
        self.assertEqual(err.exception.status_code, 503)
        self.assertIn("No fallback was used", err.exception.detail)
        self.assertIn("disabled", err.exception.detail)

    def test_summary_failure_stops_even_after_a_successful_rewrite(self):
        with tempfile.TemporaryDirectory() as temp:
            model = Path(temp) / "mock.gguf"
            model.write_bytes(b"mock")
            settings = LocalAISettings(True, model, -1, 2, 5, 5)
            def reply(_settings, payload):
                return REWRITE if payload.get("_task") == "rewrite" else "invalid"
            with (
                patch("app.services.local_ai_rewrite_service.get_local_ai_settings", return_value=settings),
                patch("app.services.local_ai_summary_service.get_local_ai_settings", return_value=settings),
                patch("app.services.local_ai_summary_service._WORKER.generate", side_effect=reply),
                patch("app.services.learning_lab_service.classify_email_detailed", side_effect=self.classify),
            ):
                with self.assertRaises(HTTPException) as err:
                    what_if(self.request())
        self.assertEqual(err.exception.status_code, 503)
        self.assertIn("learning explanation", err.exception.detail)
        self.assertIn("invalid_ai_response", err.exception.detail)

    def test_strict_success_uses_qwen_and_exposes_duration(self):
        with tempfile.TemporaryDirectory() as temp:
            model = Path(temp) / "mock.gguf"
            model.write_bytes(b"mock")
            settings = LocalAISettings(True, model, -1, 2, 5, 5)
            def reply(_settings, payload):
                return REWRITE if payload.get("_task") == "rewrite" else EXPLANATION
            with (
                patch("app.services.local_ai_rewrite_service.get_local_ai_settings", return_value=settings),
                patch("app.services.local_ai_summary_service.get_local_ai_settings", return_value=settings),
                patch("app.services.local_ai_summary_service._WORKER.generate", side_effect=reply),
                patch("app.services.learning_lab_service.classify_email_detailed", side_effect=self.classify),
            ):
                result = what_if(self.request())
        self.assertEqual(result.ai_mode, "require_qwen")
        self.assertEqual(result.applied_transformations[0].generation_method, "local_ai")
        self.assertEqual(result.learning_summary.source, "local_ai")
        self.assertIsInstance(result.applied_transformations[0].ai_duration_ms, float)
        self.assertIsInstance(result.learning_summary.ai_duration_ms, float)

    def test_rule_edits_still_remain_rule_edits_and_do_not_fake_qwen(self):
        with tempfile.TemporaryDirectory() as temp:
            model = Path(temp) / "mock.gguf"
            model.write_bytes(b"mock")
            settings = LocalAISettings(True, model, -1, 2, 5, 5)
            with (
                patch("app.services.local_ai_summary_service.get_local_ai_settings", return_value=settings),
                patch("app.services.local_ai_summary_service._WORKER.generate", return_value=EXPLANATION),
                patch("app.services.learning_lab_service.classify_email_detailed", side_effect=self.classify),
            ):
                result = what_if(self.request("subject-format"))
        self.assertEqual(result.applied_transformations[0].generation_method, "deterministic")
        self.assertEqual(result.learning_summary.source, "local_ai")

    def test_status_does_not_expose_model_path(self):
        with tempfile.TemporaryDirectory() as temp:
            model = Path(temp) / "mock.gguf"
            model.write_bytes(b"mock")
            with patch.dict("os.environ", {"PHISHLAB_LOCAL_AI_ENABLED": "1", "PHISHLAB_LOCAL_AI_MODEL_PATH": str(model), "PHISHLAB_LOCAL_AI_GPU_LAYERS": "-1"}):
                result = ai_status()
        self.assertTrue(result["model_file_available"])
        self.assertEqual(result["gpu_layers"], -1)
        self.assertNotIn(temp, str(result))

    def test_default_offload_matches_detected_device(self):
        from app.services.device_ai_settings import detect_device_profile
        with patch.dict("os.environ", {"PHISHLAB_LOCAL_AI_GPU_LAYERS": ""}):
            self.assertEqual(get_local_ai_settings().gpu_layers, detect_device_profile().gpu_layers)


if __name__ == "__main__":
    unittest.main()
