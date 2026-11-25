"""Tests for metrics and private CSV handling, no real classifier needed."""
from __future__ import annotations
import csv
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from evaluate_classifier import compute_metrics, evaluate, load_holdout, build_markdown


class FakeClassifier:
    classes_ = [1, 0]  # ensure 1-class index is not assumed to be final column

    def predict_proba(self, texts):
        return [[0.9, 0.1] if "urgent" in t.lower() else [0.1, 0.9] for t in texts]

    def predict(self, texts):
        return [1 if "urgent" in t.lower() else 0 for t in texts]


class ClassifierEvaluationTests(unittest.TestCase):
    def test_confusion_matrix_and_metrics(self):
        result = compute_metrics([0, 0, 1, 1], [0, 1, 1, 0], [0.1, 0.9, 0.8, 0.2])
        self.assertEqual(result["confusion_matrix"], {
            "true_negative": 1, "false_positive": 1,
            "false_negative": 1, "true_positive": 1,
        })
        self.assertEqual(result["f1_phishing"], .5)
        self.assertEqual(result["recall_phishing"], .5)

    def test_model_evaluation_without_leaking_text(self):
        sensitive = "confidential client message"
        result = evaluate(FakeClassifier(), [sensitive, "urgent payment", "legitimate item", "urgent alert"],
                          [0, 1, 0, 1], ["small"] * 4, {"rows": 4, "legitimate": 2, "phishing": 2, "duplicate_rows": 0})
        self.assertEqual(result["default_model_decision"]["accuracy"], 1.0)
        self.assertEqual(result["default_model_decision"]["roc_auc"], 1.0)
        self.assertEqual(result["slices"]["small"]["status"], "insufficient_samples")
        self.assertNotIn(sensitive, str(result))
        self.assertIn("Phishing recall", build_markdown(result))

    def test_holdout_validation_and_duplicate_counts(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / "holdout.csv"
            with file.open("w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow(["subject", "body", "label", "group"])
                writer.writerow(["Sale", "Hello", "0", "partner"])
                writer.writerow(["URGENT", "Send password", "1", "partner"])
                writer.writerow(["Sale", "Hello", "0", "partner"])
            texts, y, groups, metadata = load_holdout(file)
            self.assertEqual(metadata["duplicate_rows"], 1)
            self.assertEqual(len(y), 3)
            self.assertEqual(groups[0], "partner")

    def test_reject_contradictory_duplicate_labels(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / "holdout.csv"
            file.write_text("subject,body,label\nA,B,0\nA,B,1\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "contradictory"):
                load_holdout(file)

if __name__ == "__main__":
    unittest.main()
