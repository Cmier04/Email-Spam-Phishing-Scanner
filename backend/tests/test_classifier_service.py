import unittest
from unittest.mock import patch

from app.services.classifier_service import classify_email, classify_email_detailed


class FakeModel:
    # Deliberately put malicious first to verify classes_, not position/max, is used.
    classes_ = [1, 0]

    def predict(self, texts):
        self.predict_input = texts
        return [0]

    def predict_proba(self, texts):
        self.proba_input = texts
        return [[0.2, 0.8]]


class ClassifierDetailTests(unittest.TestCase):
    def test_probability_uses_actual_malicious_class_index(self):
        fake_model = FakeModel()
        with patch("app.services.classifier_service.model", fake_model):
            result = classify_email_detailed("Subject", "Body")

        self.assertEqual(fake_model.predict_input, ["Subject Body"])
        self.assertEqual(result["classification"], "Legitimate")
        self.assertEqual(result["confidence"], 80.0)
        self.assertEqual(result["malicious_probability"], 20.0)

    def test_existing_classify_contract_remains_unchanged(self):
        with patch(
            "app.services.classifier_service.classify_email_detailed",
            return_value={
                "classification": "Legitimate",
                "confidence": 88.0,
                "malicious_probability": 12.0,
            },
        ):
            result = classify_email("Subject", "Body")

        self.assertEqual(
            result,
            {"classification": "Legitimate", "confidence": 88.0},
        )


if __name__ == "__main__":
    unittest.main()
