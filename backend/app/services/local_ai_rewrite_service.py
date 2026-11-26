"""Local educational rewrites of isolated email copies for the Learning Lab.

This module never edits Gmail messages or sends their text over HTTP.
It uses the SAME optional local GGUF worker as Learning Lab summaries.
The source is untrusted and model output is validated before display.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
import logging
import re
from time import perf_counter
from typing import Literal

from app.services.local_ai_summary_service import (
    LocalAIFailed,
    LocalAIInvalid,
    LocalAITimeout,
    LocalAIUnavailable,
    _WORKER,
    get_local_ai_settings,
)

_LOGGER = logging.getLogger(__name__)

RewriteReason = Literal[
    "disabled", "local_model_unavailable", "invalid_ai_response",
    "generation_timeout", "generation_failed",
]


@dataclass(frozen=True)
class RewriteResult:
    text: str | None
    fallback_reason: RewriteReason | None = None
    ai_duration_ms: float | None = None


# Links and addresses are removed BEFORE the text is passed to the local LLM.
_LINK = re.compile(
    r"(?:https?://|www\.)[^\s<>\"']+|"
    r"\b(?:[a-z0-9-]+\.)+(?:com|net|org|edu|gov|io|co|info|app|xyz)"
    r"(?:/[^\s<>\"']*)?",
    re.IGNORECASE,
)
_ADDRESS = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
_MARKUP = re.compile(r"<[^>]*>|\[/?(?:INST|SYS)\]|<\|[^>]+\|>", re.IGNORECASE)
_UNSAFE_OUTPUT = re.compile(
    r"(?:https?://|www\.|\b\S+@\S+\b|[<>`{}]|\b(?:"
    r"urgent|immediately|act now|click here|sign in now|log in now|"
    r"send your|share your|enter your|provide your|confirm your password|"
    r"wire transfer|gift card|account will be (?:closed|suspended)|"
    r"limited time|ignore previous instructions)\b)",
    re.IGNORECASE,
)
_TASKS = {
    "subject-wording": ("subject", 180, 12, 140),
    "body-rephrase": ("body", 1400, 25, 850),
    "request-rephrase": ("request", 400, 20, 300),
}


def _sanitized_source(text: str, limit: int) -> str:
    # Untrusted email contents are data, not instructions. Cap what the worker sees.
    text = _ADDRESS.sub("[address removed]", text[:limit])
    text = _LINK.sub("[link removed]", text)
    text = _MARKUP.sub(" ", text)
    return " ".join(text.split())


def _validate_rewrite(raw: str, transformation_id: str, source: str) -> str:
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError) as exc:
        raise LocalAIInvalid("Rewrite was not valid JSON") from exc
    if not isinstance(parsed, dict) or set(parsed) != {"rewritten_text"}:
        raise LocalAIInvalid("Rewrite response must contain only rewritten_text")
    value = parsed["rewritten_text"]
    if not isinstance(value, str):
        raise LocalAIInvalid("Rewrite must be text")
    value = " ".join(value.strip().split())
    _, _, minimum, maximum = _TASKS[transformation_id]
    if not minimum <= len(value) <= maximum:
        raise LocalAIInvalid("Rewrite exceeded the permitted length")
    if value.casefold() == " ".join(source.split()).casefold():
        raise LocalAIInvalid("Rewrite did not change the source")
    if _UNSAFE_OUTPUT.search(value) or "\n" in value or "\r" in value:
        raise LocalAIInvalid("Rewrite contained disallowed content")
    # Do not generate new numerical dates, times, phone numbers or amounts;
    # these could introduce invented facts into a security-learning exercise.
    # Digits already present in the source are fine; new ones are not.
    if set(re.findall(r"\d+", value)) - set(re.findall(r"\d+", source)):
        raise LocalAIInvalid("Rewrite introduced a numerical detail")
    if transformation_id != "subject-wording" and not re.search(
        r"\b(?:official|trusted|independently|independent|directly|service you normally use)\b", value, re.IGNORECASE
    ):
        # Small models often skip this; add it deterministically instead of failing.
        suffix = " Please verify through a trusted official service."
        if len(value) + len(suffix) <= maximum:
            value += suffix
        else:
            raise LocalAIInvalid("Rewrite omitted independent-verification advice")
    return value


def generate_educational_rewrite(
    transformation_id: str, *, text: str, subject_context: str = ""
) -> RewriteResult:
    """Generate one neutralizing rewrite, or return a reason for safe fallback.

    Only allowlisted transformations can call Qwen; no model scores or
    classification labels are accepted from its output.
    """
    if transformation_id not in _TASKS:
        raise ValueError("Unsupported AI rewrite task")
    settings = get_local_ai_settings()
    if not settings.enabled:
        return RewriteResult(None, "disabled")
    if settings.model_path.suffix.lower() != ".gguf" or not settings.model_path.is_file():
        return RewriteResult(None, "local_model_unavailable")

    field, cap, _, _ = _TASKS[transformation_id]
    source = _sanitized_source(text, cap)
    if not source:
        return RewriteResult(None, "invalid_ai_response")
    payload = {
        "_task": "rewrite",
        "rewrite_kind": field,
        "untrusted_source_text": source,
        "untrusted_subject_context": _sanitized_source(subject_context, 160),
    }
    started = perf_counter()
    try:
        raw = _WORKER.generate(settings, payload)
        replacement = _validate_rewrite(raw, transformation_id, source)
        return RewriteResult(replacement, ai_duration_ms=round((perf_counter() - started) * 1000, 1))
    except LocalAITimeout:
        return RewriteResult(None, "generation_timeout")
    except LocalAIUnavailable:
        return RewriteResult(None, "local_model_unavailable")
    except LocalAIFailed:
        return RewriteResult(None, "generation_failed")
    except (LocalAIInvalid, RuntimeError, ValueError, TypeError) as exc:
        _LOGGER.warning("Local AI rewrite rejected: %s", exc)
        return RewriteResult(None, "invalid_ai_response")
