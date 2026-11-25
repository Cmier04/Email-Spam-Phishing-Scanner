"""quick local Qwen rewrite availability/latency smoke benchmark.

No real Gmail data. Run from Backend/: python scripts/benchmark_qwen.py
Use repeat=1 for cold startup; later repeats benefit from worker and rewrite cache.
"""
from __future__ import annotations
import argparse
from collections import Counter
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from statistics import median
from time import perf_counter

from app.services.local_ai_rewrite_service import generate_educational_rewrite
from app.services.local_ai_summary_service import get_local_ai_status

SAMPLES = [
    ("subject-wording", "URGENT: Confirm your details by tonight!", ""),
    ("body-rephrase", "We detected unusual account activity. You must send your password now or access will be blocked.", "Security notice"),
    ("request-rephrase", "Please verify your account immediately!", "Verification reminder"),
]


def run(iterations: int) -> dict:
    runs, failures = [], Counter()
    for _ in range(iterations):
        for kind, source, subject in SAMPLES:
            started = perf_counter()
            outcome = generate_educational_rewrite(kind, text=source, subject_context=subject)
            elapsed = round((perf_counter() - started) * 1000, 1)
            runs.append({"kind": kind, "valid": outcome.text is not None, "duration_ms": elapsed,
                         "error": outcome.fallback_reason})
            if outcome.fallback_reason:
                failures[outcome.fallback_reason] += 1
    durations = sorted(run["duration_ms"] for run in runs)
    return {"note": "Synthetic educational examples only. Successful output still requires human review for topic preservation.",
            "configuration": get_local_ai_status(),
            "attempts": len(runs), "successful_validated_rewrites": sum(run["valid"] for run in runs),
            "validation_pass_rate": sum(run["valid"] for run in runs) / len(runs),
            "median_duration_ms": median(durations),
            "p95_duration_ms": durations[max(0, int(len(durations) * .95 + .999) - 1)],
            "failures": dict(failures), "runs": runs}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--iterations", type=int, default=2)
    parser.add_argument("--output", type=Path, default=Path("evaluation_results/qwen_benchmark.json"))
    args = parser.parse_args()
    if not 1 <= args.iterations <= 20:
        parser.error("--iterations must be between 1 and 20")
    report = run(args.iterations)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Qwen validated rewrite rate: {report['successful_validated_rewrites']}/{report['attempts']}")
    print(f"Median: {report['median_duration_ms']} ms; p95: {report['p95_duration_ms']} ms")
    print(f"Metrics saved to {args.output}")


if __name__ == "__main__":
    main()
