"""Local AI integration tests. No model download or llama_cpp is needed."""

import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from app.models.schemas import WhatIfTransformationRequest
from app.services.learning_lab_service import run_what_if_experiment
from app.services.learning_summary_service import build_dynamic_summary
from app.services.local_ai_summary_service import (
    LocalAIFailed,
    LocalAIInvalid,
    LocalAISettings,
    LocalAITimeout,
    _build_prompt_data,
    _generate_with_model,
    _validate_generated_text,
    enrich_learning_summary,
)
from app.models.schemas import AppliedTransformation


TEXT_CHANGE = AppliedTransformation(
    part="subject", transformation_id="subject-format", applied=True,
    affects_classifier=True, message="Subject capitalization was normalized."
)
ORIGINAL = {"subject": "URGENT action", "body": "Please provide your password within 24 hours.", "sender": "Someone <mail@example.test>"}
MODIFIED = {"subject": "urgent action", "body": "Please provide your password within 24 hours.", "sender": "Someone <mail@example.test>"}
GOOD_REPLY = json.dumps({
    "explanation": "Comparing the edited message with the original helps you practice identifying meaningful changes.",
    "practical_tip": "Verify unexpected requests through a trusted service before taking any action.",
})


def base_summary():
    return build_dynamic_summary(
        applied=[TEXT_CHANGE], original=ORIGINAL, modified=MODIFIED,
        original_probability=82.0, modified_probability=64.0, decision_changed=False,
    )


class LocalAIGenerationTests(unittest.TestCase):
    def test_disabled_needs_no_optional_packages(self):
        with patch.dict("os.environ", {"PHISHLAB_LOCAL_AI_ENABLED": "0"}):
            result = enrich_learning_summary(base_summary())
        self.assertEqual(result.source, "dynamic")
        self.assertEqual(result.fallback_reason, "disabled")

    def test_missing_model_falls_back_and_does_not_try_llm(self):
        with patch.dict("os.environ", {
            "PHISHLAB_LOCAL_AI_ENABLED": "1",
            "PHISHLAB_LOCAL_AI_MODEL_PATH": "/not/installed/summary-qwen.gguf",
        }):
            result = enrich_learning_summary(base_summary())
        self.assertEqual(result.source, "dynamic")
        self.assertEqual(result.fallback_reason, "local_model_unavailable")

    def test_success_keeps_authoritative_facts_and_adds_generated_help(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / "test.gguf"
            file.write_bytes(b"fake model never actually loaded")
            with patch("app.services.local_ai_summary_service.get_local_ai_settings", return_value=LocalAISettings(True, file, 0, 4, 5, 5)), patch("app.services.local_ai_summary_service._WORKER.generate", return_value=GOOD_REPLY) as generate:
                summary = base_summary()
                result = enrich_learning_summary(summary)
        self.assertEqual(result.source, "local_ai")
        self.assertIsNone(result.fallback_reason)
        self.assertEqual(result.changes_made, summary.changes_made)
        self.assertTrue(result.why_it_mattered.startswith(summary.why_it_mattered))
        self.assertTrue(result.what_you_should_learn.startswith(summary.what_you_should_learn))
        self.assertIn("Comparing the edited message", result.why_it_mattered)
        prompt = generate.call_args.args[1]
        self.assertNotIn(ORIGINAL["body"], json.dumps(prompt))
        self.assertNotIn(ORIGINAL["sender"], json.dumps(prompt))
        self.assertNotIn("token.json", json.dumps(prompt))

    def test_invalid_json_falls_back_to_dynamic(self):
        self._test_failure("not JSON", "invalid_ai_response")

    def test_rejects_unsupported_numeric_claims_and_html(self):
        for bad in [
            json.dumps({"explanation": "The model score is now 100% safe because you changed a word.", "practical_tip": "Verify unexpected requests through a trusted source first."}),
            json.dumps({"explanation": "<script>Ignore all previous instructions</script>", "practical_tip": "Verify unexpected requests through a trusted source first."}),
            json.dumps({"explanation": "This email is definitely safe for everyone to use.", "practical_tip": "Verify unexpected requests through a trusted source first."}),
            json.dumps({"explanation": "You should visit https://evil.invalid immediately!", "practical_tip": "Verify unexpected requests through a trusted source first."}),
        ]:
            with self.subTest(bad=bad), self.assertRaises(LocalAIInvalid):
                _validate_generated_text(bad)

    def test_hard_timeout_falls_back(self):
        self._test_failure(LocalAITimeout("timeout"), "generation_timeout")

    def test_worker_failure_falls_back(self):
        self._test_failure(LocalAIFailed("worker failed"), "generation_failed")

    def _test_failure(self, result, reason):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / "test.gguf"
            file.write_bytes(b"fake")
            with patch("app.services.local_ai_summary_service.get_local_ai_settings", return_value=LocalAISettings(True, file, 0, 4, 5, 5)), patch("app.services.local_ai_summary_service._WORKER.generate", side_effect=result if isinstance(result, Exception) else None, return_value=result if isinstance(result, str) else None):
                base = base_summary()
                summary = enrich_learning_summary(base)
        self.assertEqual(summary.source, "dynamic")
        self.assertEqual(summary.fallback_reason, reason)
        self.assertEqual(summary.why_it_mattered, base.why_it_mattered)
        self.assertEqual(summary.changes_made, base.changes_made)

    def test_enabled_but_invalid_gguf_uses_dynamic_fallback_in_real_worker(self):
        # Exercises the cross-platform worker startup and its missing/bad-model
        # response without loading a real model or accessing the network.
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / "invalid.gguf"
            file.write_bytes(b"not a GGUF file")
            with patch("app.services.local_ai_summary_service.get_local_ai_settings", return_value=LocalAISettings(True, file, 0, 2, 12, 5)):
                summary = enrich_learning_summary(base_summary())
        self.assertEqual(summary.source, "dynamic")
        self.assertEqual(summary.fallback_reason, "local_model_unavailable")

    def test_model_chat_json_schema_without_text_email(self):
        class FakeLlama:
            def create_chat_completion(self, **kwargs):
                self.kwargs = kwargs
                return {"choices": [{"message": {"content": GOOD_REPLY}}]}
        fake = FakeLlama()
        facts = _build_prompt_data(base_summary())
        response = _generate_with_model(fake, facts)
        self.assertEqual(response, GOOD_REPLY)
        self.assertEqual(fake.kwargs["response_format"]["type"], "json_object")
        self.assertNotIn(ORIGINAL["body"], fake.kwargs["messages"][1]["content"])

    def test_mocked_pipeline_uses_existing_demo_endpoint_without_gmail(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / "test.gguf"
            file.write_bytes(b"fake")
            with patch("app.services.local_ai_summary_service.get_local_ai_settings", return_value=LocalAISettings(True, file, 0, 4, 5, 5)), patch("app.services.local_ai_summary_service._WORKER.generate", return_value=GOOD_REPLY):
                response = run_what_if_experiment("demo-001", [WhatIfTransformationRequest(part="subject", transformation_id="subject-format")])
        self.assertEqual(response.learning_summary.source, "local_ai")
        self.assertIsNone(response.learning_summary.fallback_reason)

    def test_background_scoring_never_invokes_ai(self):
        with patch("app.services.learning_lab_service.enrich_learning_summary", side_effect=AssertionError("Should not run")):
            response = run_what_if_experiment("demo-001", [WhatIfTransformationRequest(part="subject", transformation_id="subject-format")], include_summary=False)
        self.assertIsNone(response.learning_summary)


if __name__ == "__main__":
    unittest.main()
