"""Deterministic and optional local-AI rewrites for isolated Learning Lab copies."""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, replace
from email.utils import parseaddr
import re
from typing import Callable

from app.models.schemas import (
    AppliedTransformation,
    WhatIfResponse,
    WhatIfTransformationRequest,
)
from app.services.classifier_service import classify_email_detailed
from app.services.demo_email_service import (
    get_demo_experiment_email,
    is_demo_email_id,
)
from app.services.gmail_service import get_message_by_id, parse_message
from app.services.learning_summary_service import build_dynamic_summary
from app.services.local_ai_summary_service import enrich_learning_summary
from app.services.local_ai_rewrite_service import generate_educational_rewrite


class LearningLabValidationError(ValueError):
    """Raised for unsupported, mismatched, or conflicting transformations."""


class QwenRequiredError(RuntimeError):
    """Strict mode failed; never silently replace Qwen output with rules."""

    def __init__(self, step: str, reason: str):
        self.step = step
        self.reason = reason
        super().__init__(f"Qwen required for {step}, but it failed ({reason}). No fallback was used.")


@dataclass(frozen=True)
class TransformationDefinition:
    part: str
    affects_classifier: bool
    apply: Callable[[dict], "TransformationApplication"]


@dataclass(frozen=True)
class TransformationApplication:
    applied: bool
    message: str
    modified_value: str | None = None
    generation_method: str = "deterministic"
    fallback_reason: str | None = None
    ai_duration_ms: float | None = None


def _subject_format(email: dict) -> TransformationApplication:
    email["subject"] = email["subject"].lower()
    return TransformationApplication(
        True, "Subject capitalization was normalized.", email["subject"]
    )


def _subject_wording(email: dict) -> TransformationApplication:
    email["subject"] = "A note about your account"
    return TransformationApplication(
        True,
        "Subject wording was replaced with the predefined neutral text.",
        email["subject"],
    )


def _body_rephrase(email: dict) -> TransformationApplication:
    email["body"] = (
        "We noticed a recent change associated with your account. "
        "Review your account through the service you normally use."
    )
    return TransformationApplication(
        True,
        "The complete message body was replaced with predefined text.",
        email["body"],
    )


def _replace_greeting(email: dict) -> TransformationApplication:
    body = email["body"]
    match = re.match(
        r"^(\s*)(dear|hello|hi|good morning|good afternoon|good evening)"
        r"[^\r\n]{0,80}[,:](?=\s|$)",
        body,
        flags=re.IGNORECASE,
    )
    if not match:
        return TransformationApplication(
            False,
            "No clearly identifiable greeting was found at the start of the body.",
        )
    email["body"] = f"{match.group(1)}Hello," + body[match.end():]
    return TransformationApplication(
        True, "The greeting at the start of the body was replaced.", "Hello,"
    )


def _find_requested_sentence(body: str) -> re.Match | None:
    sentences = list(re.finditer(r"[^.!?\r\n]+(?:[.!?]+|$)", body))
    action_pattern = re.compile(
        r"\b(please|must|verify|update|click|open|review|confirm|send|pay|"
        r"within\s+\d+|immediately)\b",
        flags=re.IGNORECASE,
    )
    matches = [
        sentence for sentence in sentences
        if action_pattern.search(sentence.group())
    ]
    return matches[0] if len(matches) == 1 else None


def _replace_request(email: dict) -> TransformationApplication:
    body = email["body"]
    sentence = _find_requested_sentence(body)
    if sentence is None:
        return TransformationApplication(
            False,
            "A single unambiguous requested-action sentence could not be identified.",
        )
    replacement = (
        " If this activity was unexpected, review your account using the official "
        "service."
    )
    email["body"] = (
        body[:sentence.start()] + replacement.lstrip() + body[sentence.end():]
    )
    return TransformationApplication(
        True,
        "One clearly identifiable requested-action sentence was replaced.",
        replacement.strip(),
    )


# Qwen rewrites only the allowlisted text transformations. All others remain
# deterministic so changing display metadata never invokes a generative model.
_AI_REWRITE_IDS = frozenset({"subject-wording", "body-rephrase", "request-rephrase"})


def _apply_local_rewrite(
    original: dict,
    modified: dict,
    transformation_id: str,
    definition: TransformationDefinition,
    *, require_qwen: bool = False,
) -> TransformationApplication:
    if transformation_id not in _AI_REWRITE_IDS:
        return definition.apply(modified)

    requested_sentence = None
    if transformation_id == "request-rephrase":
        requested_sentence = _find_requested_sentence(modified["body"])
        if requested_sentence is None:
            return definition.apply(modified)
        source_text = requested_sentence.group().strip()
    elif transformation_id == "subject-wording":
        source_text = original["subject"]
    else:
        source_text = original["body"]

    ai = generate_educational_rewrite(
        transformation_id,
        text=source_text,
        subject_context=original["subject"] if transformation_id != "subject-wording" else "",
    )
    if ai.text is None:
        if require_qwen:
            raise QwenRequiredError(transformation_id, ai.fallback_reason or "generation_failed")
        fallback = definition.apply(modified)
        return replace(fallback, generation_method="fallback", fallback_reason=ai.fallback_reason)

    if transformation_id == "subject-wording":
        modified["subject"] = ai.text
        return TransformationApplication(
            True, "Qwen generated an email-specific, neutral subject example.",
            ai.text, generation_method="local_ai", ai_duration_ms=ai.ai_duration_ms,
        )
    if transformation_id == "body-rephrase":
        modified["body"] = ai.text
        return TransformationApplication(
            True, "Qwen generated a neutral educational rewrite of the email body.",
            ai.text, generation_method="local_ai", ai_duration_ms=ai.ai_duration_ms,
        )
    # Preserve all other sentences when editing the identified action request.
    assert requested_sentence is not None
    body = modified["body"]
    modified["body"] = (
        body[:requested_sentence.start()]
        + ai.text
        + body[requested_sentence.end():]
    )
    return TransformationApplication(
        True, "Qwen rewrote one requested-action sentence for independent verification.",
        ai.text, generation_method="local_ai", ai_duration_ms=ai.ai_duration_ms,
    )


def _sender_label(email: dict) -> TransformationApplication:
    _, address = parseaddr(email.get("sender", ""))
    email["sender"] = (
        f"Example Account Services <{address}>"
        if address
        else "Example Account Services"
    )
    return TransformationApplication(
        True,
        "The sender display label was changed only on the isolated copy.",
        "Example Account Services",
    )


def _sender_domain(email: dict) -> TransformationApplication:
    name, _ = parseaddr(email.get("sender", ""))
    address = "notice@account-services.example"
    email["sender"] = f"{name} <{address}>" if name else address
    return TransformationApplication(
        True,
        "The sender address was changed to a reserved example domain.",
        address,
    )


def _unavailable(component: str) -> Callable[[dict], TransformationApplication]:
    def apply(_email: dict) -> TransformationApplication:
        return TransformationApplication(
            False,
            f"{component} is not exposed as a separate field by the Gmail parser, "
            "so unrelated body text was left unchanged.",
        )

    return apply


def _layout(
    description: str, value: str
) -> Callable[[dict], TransformationApplication]:
    def apply(_email: dict) -> TransformationApplication:
        return TransformationApplication(True, description, value)

    return apply


# Registry order is the canonical application order, independent of request order.
TRANSFORMATIONS: dict[str, TransformationDefinition] = {
    "sender-label": TransformationDefinition("sender_name", False, _sender_label),
    "sender-domain": TransformationDefinition("sender_address", False, _sender_domain),
    "subject-format": TransformationDefinition("subject", True, _subject_format),
    "subject-wording": TransformationDefinition("subject", True, _subject_wording),
    "greeting-generic": TransformationDefinition("greeting", True, _replace_greeting),
    "body-rephrase": TransformationDefinition("body", True, _body_rephrase),
    "request-rephrase": TransformationDefinition("request", True, _replace_request),
    "link-placeholder": TransformationDefinition(
        "link_text", False, _unavailable("Link display text")
    ),
    "attachment-label": TransformationDefinition(
        "attachment", False, _unavailable("Attachment filename metadata")
    ),
    "signature-fictional": TransformationDefinition(
        "signature", False, _unavailable("Signature")
    ),
    "layout-spacing": TransformationDefinition(
        "formatting",
        False,
        _layout("Spacious layout was recorded for the frontend preview.", "spacious"),
    ),
    "layout-compact": TransformationDefinition(
        "formatting",
        False,
        _layout("Compact layout was recorded for the frontend preview.", "compact"),
    ),
}


def _validate_and_order(
    requested: list[WhatIfTransformationRequest],
) -> list[tuple[str, TransformationDefinition]]:
    selected: dict[str, TransformationDefinition] = {}
    selected_parts: set[str] = set()
    for item in requested:
        definition = TRANSFORMATIONS.get(item.transformation_id)
        if definition is None:
            raise LearningLabValidationError(
                f"Unsupported transformation_id '{item.transformation_id}'."
            )
        if item.part != definition.part:
            raise LearningLabValidationError(
                f"Transformation '{item.transformation_id}' is only valid for part "
                f"'{definition.part}', not '{item.part}'."
            )
        if item.transformation_id in selected or item.part in selected_parts:
            raise LearningLabValidationError(
                f"Conflicting transformations were supplied for part '{item.part}'."
            )
        selected[item.transformation_id] = definition
        selected_parts.add(item.part)

    # A complete body rewrite would erase or redefine these semantic slices.
    if "body" in selected_parts and selected_parts.intersection(
        {"greeting", "request"}
    ):
        raise LearningLabValidationError(
            "A whole-body transformation conflicts with greeting or request "
            "transformations."
        )

    return [
        (transformation_id, definition)
        for transformation_id, definition in TRANSFORMATIONS.items()
        if transformation_id in selected
    ]


def run_what_if_experiment(
    email_id: str,
    transformations: list[WhatIfTransformationRequest],
    *, include_summary: bool = True, ai_mode: str = "automatic",
) -> WhatIfResponse:
    """Retrieve an email, transform a deep copy, and compare real inference."""
    if ai_mode not in {"automatic", "require_qwen"}:
        raise LearningLabValidationError("Unsupported ai_mode")
    ordered = _validate_and_order(transformations)
    if is_demo_email_id(email_id):
        source = "demo"
        original = get_demo_experiment_email(email_id)
    else:
        source = "gmail"
        original = parse_message(get_message_by_id(email_id))
    modified = deepcopy(original)
    original_result = classify_email_detailed(original["subject"], original["body"])

    results: list[AppliedTransformation] = []
    modified_values: dict[str, str] = {}
    warnings: list[str] = []
    for transformation_id, definition in ordered:
        application = _apply_local_rewrite(
            original, modified, transformation_id, definition,
            require_qwen=ai_mode == "require_qwen",
        )
        affects_classifier = definition.affects_classifier and application.applied
        results.append(
            AppliedTransformation(
                part=definition.part,
                transformation_id=transformation_id,
                applied=application.applied,
                affects_classifier=affects_classifier,
                message=application.message,
                generation_method=application.generation_method,
                fallback_reason=application.fallback_reason,
                ai_duration_ms=application.ai_duration_ms,
            )
        )
        if application.applied and application.modified_value is not None:
            modified_values[definition.part] = application.modified_value
            if definition.part == "body":
                # The Gmail parser exposes one flattened body. A whole-body
                # replacement removes semantic slices shown separately by the UI.
                modified_values.update(
                    {"greeting": "", "request": "", "signature": ""}
                )
        if not application.applied:
            warnings.append(application.message)
        elif application.generation_method == "fallback":
            warnings.append(
                f"{transformation_id} used its fixed fallback "
                f"(local AI: {application.fallback_reason or 'unavailable'})."
            )
        elif not definition.affects_classifier:
            warnings.append(
                f"{application.message} This transformation does not change the subject/body "
                "input used by the current classifier."
            )

    modified_result = classify_email_detailed(modified["subject"], modified["body"])
    learning_summary = None
    if include_summary:
        # Preserve verified explanation; optional local AI only
        # adds educational wording and can never replace model predictions.
        dynamic_summary = build_dynamic_summary(
            applied=results,
            original=original,
            modified=modified,
            original_probability=original_result["malicious_probability"],
            modified_probability=modified_result["malicious_probability"],
            decision_changed=(
                original_result["classification"] != modified_result["classification"]
            ),
        )
        learning_summary = enrich_learning_summary(dynamic_summary)
        if ai_mode == "require_qwen" and learning_summary.source != "local_ai":
            raise QwenRequiredError("learning explanation", learning_summary.fallback_reason or "generation_failed")
    return WhatIfResponse(
        email_id=email_id,
        ai_mode=ai_mode,
        source=source,
        original_classification=original_result["classification"],
        original_confidence=original_result["confidence"],
        original_malicious_probability=original_result["malicious_probability"],
        modified_classification=modified_result["classification"],
        modified_confidence=modified_result["confidence"],
        modified_malicious_probability=modified_result["malicious_probability"],
        score_change=round(
            modified_result["malicious_probability"]
            - original_result["malicious_probability"],
            2,
        ),
        decision_changed=(
            original_result["classification"] != modified_result["classification"]
        ),
        applied_transformations=results,
        modified_subject=modified["subject"],
        modified_body=modified["body"],
        modified_values=modified_values,
        warnings=warnings,
        learning_summary=learning_summary,
    )
