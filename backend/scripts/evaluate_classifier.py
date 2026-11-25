"""evaluate a frozen binary email classifier on unseen labeled CSV data.

Run from Backend/: python scripts/evaluate_classifier.py --input path/to/holdout.csv

The evaluation never stores individual subject/body fields in the report, and
never trains or changes the classifier. Load only your own trusted model file.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import csv
import hashlib
import json
from pathlib import Path
import time
from typing import Any

import joblib
from sklearn.metrics import (
    accuracy_score, average_precision_score, brier_score_loss,
    confusion_matrix, f1_score, precision_score, recall_score, roc_auc_score,
)

DEFAULT_MODEL = Path(__file__).resolve().parents[1] / "model" / "email_classifier.pkl"


def load_holdout(path: Path) -> tuple[list[str], list[int], list[str], dict[str, Any]]:
    texts, labels, slices = [], [], []
    hashes: Counter[str] = Counter()
    conflicting: dict[str, set[int]] = defaultdict(set)
    with path.open(encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        if not reader.fieldnames or not {"subject", "body", "label"}.issubset(reader.fieldnames):
            raise ValueError("CSV must contain subject,body,label columns (optional group column).")
        for line_no, row in enumerate(reader, 2):
            subject = (row.get("subject") or "").strip()
            body = (row.get("body") or "").strip()
            if not subject and not body:
                raise ValueError(f"Row {line_no}: email content must not be empty")
            raw_label = (row.get("label") or "").strip()
            if raw_label not in ("0", "1"):
                raise ValueError(f"Row {line_no}: label must be 0 legitimate or 1 phishing")
            label = int(raw_label)
            # Match classifier's training input without modifying punctuation/case.
            text = f"{subject} {body}"
            digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
            hashes[digest] += 1
            conflicting[digest].add(label)
            texts.append(text)
            labels.append(label)
            slices.append((row.get("group") or "unspecified").strip()[:50] or "unspecified")
    if len(labels) < 2 or len(set(labels)) < 2:
        raise ValueError("Holdout must contain both legitimate (0) and phishing (1) examples")
    if any(len(values) > 1 for values in conflicting.values()):
        raise ValueError("The same email appears with contradictory labels; correct holdout before evaluating")
    return texts, labels, slices, {
        "rows": len(labels),
        "legitimate": labels.count(0),
        "phishing": labels.count(1),
        "duplicate_rows": sum(count - 1 for count in hashes.values() if count > 1),
        "note": "Use unseen, correctly labeled holdout examples; no subject/body is included in reports.",
    }


def compute_metrics(y_true: list[int], y_pred: list[int], scores: list[float]) -> dict[str, Any]:
    if not (len(y_true) == len(y_pred) == len(scores)) or not y_true:
        raise ValueError("Metric arrays must be nonempty and have equal length")
    tn, fp, fn, tp = [int(x) for x in confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()]
    result = {
        "samples": len(y_true),
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision_phishing": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall_phishing": float(recall_score(y_true, y_pred, zero_division=0)),
        "f1_phishing": float(f1_score(y_true, y_pred, zero_division=0)),
        "specificity_legitimate": tn / (tn + fp) if tn + fp else None,
        "false_positive_rate": fp / (tn + fp) if tn + fp else None,
        "false_negative_rate": fn / (fn + tp) if fn + tp else None,
        "confusion_matrix": {"true_negative": tn, "false_positive": fp,
                             "false_negative": fn, "true_positive": tp},
    }
    # Slice metrics can be mono-class; ROC-AUC needs both classes.
    if len(set(y_true)) == 2:
        result.update({
            "roc_auc": float(roc_auc_score(y_true, scores)),
            "average_precision": float(average_precision_score(y_true, scores)),
            "brier_score": float(brier_score_loss(y_true, scores)),
        })
    return result


def evaluate(model: Any, texts: list[str], labels: list[int], groups: list[str],
             metadata: dict[str, Any], *, min_group_size: int = 5) -> dict[str, Any]:
    if not hasattr(model, "classes_") or 1 not in list(model.classes_) or 0 not in list(model.classes_):
        raise ValueError("Classifier must expose classes_ containing 0 and 1")
    malicious_idx = list(model.classes_).index(1)
    started = time.perf_counter()
    probabilities = model.predict_proba(texts)
    predictions = model.predict(texts)
    elapsed = time.perf_counter() - started
    scores = [float(row[malicious_idx]) for row in probabilities]
    preds = [int(value) for value in predictions]
    if len(scores) != len(labels) or len(preds) != len(labels):
        raise ValueError("The classifier did not return one score per example")
    if any(not 0 <= prob <= 1 for prob in scores) or any(p not in (0, 1) for p in preds):
        raise ValueError("Classifier predictions/probabilities must be valid binary outputs")
    result = {
        "data": metadata,
        "inference": {"total_seconds": round(elapsed, 3),
                      "milliseconds_per_email": round(elapsed * 1000 / len(texts), 3)},
        "default_model_decision": compute_metrics(labels, preds, scores),
        "threshold_sweep": {str(threshold): compute_metrics(labels, [int(p >= threshold) for p in scores], scores)
                            for threshold in (0.3, 0.5, 0.7)},
        "slices": {},
    }
    for group in sorted(set(groups)):
        idx = [i for i, name in enumerate(groups) if name == group]
        if len(idx) >= min_group_size:
            result["slices"][group] = compute_metrics([labels[i] for i in idx],
                [preds[i] for i in idx], [scores[i] for i in idx])
        else:
            result["slices"][group] = {"samples": len(idx), "status": "insufficient_samples"}
    return result


def build_markdown(result: dict[str, Any]) -> str:
    base = result["default_model_decision"]
    cm = base["confusion_matrix"]
    percent = lambda x: "N/A" if x is None else f"{x * 100:.1f}%"
    lines = ["# Frozen Classifier Evaluation", "",
             "This report evaluates **unseen labeled holdout data**, not model training quality.",
             f"Examples: {result['data']['rows']} | Legitimate: {result['data']['legitimate']} | Phishing: {result['data']['phishing']}",
             f"Duplicate content rows: {result['data']['duplicate_rows']} (investigate before reporting results).", "",
             "| Metric | Result |", "|---|---:|",
             f"| Accuracy | {percent(base['accuracy'])} |",
             f"| Phishing precision | {percent(base['precision_phishing'])} |",
             f"| Phishing recall | {percent(base['recall_phishing'])} |",
             f"| Phishing F1 | {percent(base['f1_phishing'])} |",
             f"| False positive rate | {percent(base['false_positive_rate'])} |",
             f"| False negative rate | {percent(base['false_negative_rate'])} |",
             f"| ROC AUC | {base.get('roc_auc', 'N/A')} |",
             "", "## Confusion matrix", "",
             "| True \\ Predicted | Legitimate | Phishing |", "|---|---:|---:|",
             f"| Legitimate | {cm['true_negative']} | {cm['false_positive']} |",
             f"| Phishing | {cm['false_negative']} | {cm['true_positive']} |", "",
             "## Threshold sensitivity (illustrative, not automatically adopted)", "",
             "| Threshold | Precision (phishing) | Recall (phishing) | False positive rate |",
             "|---|---:|---:|---:|"]
    for threshold, entry in result["threshold_sweep"].items():
        lines.append(f"| {threshold} | {percent(entry['precision_phishing'])} | {percent(entry['recall_phishing'])} | {percent(entry['false_positive_rate'])} |")
    lines.extend(["", "## Interpretation notes", "",
                  "- False negatives (phishing emails labeled legitimate) are especially important to review.",
                  "- Scores measure the trained classifier, not Qwen and not real-world safety.",
                  "- Assess class imbalance, label quality, source differences and training/holdout leakage.",
                  "- Thresholds are for comparison only; do not change production behavior without validation.",
                  "- Slice metrics with fewer than the required examples are suppressed.", ""])
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path, help="Unseen labeled holdout CSV (subject,body,label,optional group)")
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL, help="Your own trusted joblib model")
    parser.add_argument("--output-dir", type=Path, default=Path("evaluation_results"))
    parser.add_argument("--min-group-size", type=int, default=5)
    args = parser.parse_args()
    if args.min_group_size < 2:
        parser.error("--min-group-size must be at least 2")
    if not args.model.is_file():
        parser.error(f"Classifier file not found: {args.model}. Supply your real trained classifier.")
    if not args.input.is_file():
        parser.error(f"Holdout CSV not found: {args.input}")
    texts, labels, groups, metadata = load_holdout(args.input)
    model = joblib.load(args.model)  # Never load a joblib artifact from an untrusted origin.
    result = evaluate(model, texts, labels, groups, metadata,
                      min_group_size=args.min_group_size)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "classifier_metrics.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    (args.output_dir / "classifier_report.md").write_text(build_markdown(result), encoding="utf-8")
    print(f"Evaluated {len(labels)} holdout emails. Results: {args.output_dir.resolve()}")
    print(f"F1 phishing={result['default_model_decision']['f1_phishing']:.3f}; phishing recall={result['default_model_decision']['recall_phishing']:.3f}")


if __name__ == "__main__":
    main()
