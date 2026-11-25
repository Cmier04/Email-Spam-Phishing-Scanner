"""One-time model download for developers (not executed during Gmail scans).

Usage from backend/: python scripts/download_summary_model.py

Uses only Python's standard library; checks the GGUF SHA-256 published by
its Hugging Face repository before installing the model. No emails, tokens,
or credentials are transmitted by this script.
"""

from __future__ import annotations

import hashlib
from pathlib import Path
import sys
from urllib.request import Request, urlopen

MODEL_URL = (
    "https://huggingface.co/ggml-org/Qwen3-1.7B-GGUF/resolve/main/"
    "Qwen3-1.7B-Q4_K_M.gguf"
)
# Published in https://huggingface.co/ggml-org/Qwen3-1.7B-GGUF/blob/main/Qwen3-1.7B-Q4_K_M.gguf
EXPECTED_SHA256 = "d2387ca2dbfee2ffabce7120d3770dadca0b293052bc2f0e138fdc940d9bc7b5"
TARGET = Path(__file__).resolve().parents[1] / "model" / "summary-qwen.gguf"


def download_model() -> int:
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    if TARGET.is_file():
        existing_hash = hashlib.sha256()
        with TARGET.open('rb') as model_file:
            for chunk in iter(lambda: model_file.read(1024 * 1024), b''):
                existing_hash.update(chunk)
        if existing_hash.hexdigest() != EXPECTED_SHA256:
            print('Existing model failed SHA-256 validation. Move it aside before re-installing.', file=sys.stderr)
            return 1
        print(f"Existing model verified: {TARGET}")
        return 0
    partial = TARGET.with_suffix(".gguf.partial")
    digest = hashlib.sha256()
    total = 0
    try:
        request = Request(MODEL_URL, headers={"User-Agent": "PhishLab-Model-Setup/1.0"})
        print("Downloading public Qwen3-1.7B Q4_K_M GGUF (~1.28 GB)...")
        with urlopen(request, timeout=60) as response, partial.open("wb") as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
                digest.update(chunk)
                total += len(chunk)
                if total % (128 * 1024 * 1024) < len(chunk):
                    print(f"  {total / (1024 * 1024):.0f} MiB received")
        if digest.hexdigest() != EXPECTED_SHA256:
            raise ValueError("SHA-256 mismatch: model file was not installed")
        partial.replace(TARGET)
        print(f"Model verified and saved at {TARGET}")
        return 0
    except (OSError, ValueError) as exc:
        print(f"Download failed: {exc}", file=sys.stderr)
        return 1
    finally:
        if partial.exists():
            partial.unlink()


if __name__ == "__main__":
    raise SystemExit(download_model())
