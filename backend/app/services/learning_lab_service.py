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


def _set_subject(value: str) -> Callable[[dict], TransformationApplication]:
    def apply(email: dict) -> TransformationApplication:
        email["subject"] = value
        return TransformationApplication(True, "The subject was updated on the temporary copy.", value)

    return apply


def _set_body(value: str) -> Callable[[dict], TransformationApplication]:
    def apply(email: dict) -> TransformationApplication:
        email["body"] = value
        return TransformationApplication(True, "The message was updated on the temporary copy.", value)

    return apply


def _subject_format(email: dict) -> TransformationApplication:
    email["subject"] = email["subject"].lower()
    return TransformationApplication(
        True, "Subject capitalization was normalized.", email["subject"]
    )


def _subject_wording(email: dict) -> TransformationApplication:
    email["subject"] = "A note about your account"
    return TransformationApplication(
        True,
        "The subject was rewritten as a neutral example.",
        email["subject"],
    )


def _body_rephrase(email: dict) -> TransformationApplication:
    email["body"] = (
        "We noticed a recent change associated with your account. "
        "Review your account through the service you normally use."
    )
    return TransformationApplication(
        True,
        "The message was rewritten as a neutral example.",
        email["body"],
    )


def _greeting_with(greeting: str) -> Callable[[dict], TransformationApplication]:
    def apply(email: dict) -> TransformationApplication:
        return _replace_greeting(email, greeting)
    return apply


def _replace_greeting(email: dict, greeting: str = "Hello,") -> TransformationApplication:
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
    email["body"] = f"{match.group(1)}{greeting}" + body[match.end():]
    return TransformationApplication(
        True, "The greeting at the start of the body was replaced.", greeting
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


def _request_with(text: str) -> Callable[[dict], TransformationApplication]:
    def apply(email: dict) -> TransformationApplication:
        return _replace_request(email, text)
    return apply


def _replace_request(email: dict, replacement_text: str | None = None) -> TransformationApplication:
    body = email["body"]
    sentence = _find_requested_sentence(body)
    if sentence is None:
        return TransformationApplication(
            False,
            "A single unambiguous requested-action sentence could not be identified.",
        )
    replacement = replacement_text or (
        "If this activity was unexpected, review your account using the official service."
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
            True, "The subject was rewritten as a calmer example.",
            ai.text, generation_method="local_ai", ai_duration_ms=ai.ai_duration_ms,
        )
    if transformation_id == "body-rephrase":
        modified["body"] = ai.text
        return TransformationApplication(
            True, "The message was rewritten as a calmer example.",
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
        True, "The requested action was rewritten with independent-verification advice.",
        ai.text, generation_method="local_ai", ai_duration_ms=ai.ai_duration_ms,
    )


def _label_with(label: str) -> Callable[[dict], TransformationApplication]:
    def apply(email: dict) -> TransformationApplication:
        return _sender_label(email, label)
    return apply


def _sender_label(email: dict, label: str = "Example Account Services") -> TransformationApplication:
    _, address = parseaddr(email.get("sender", ""))
    email["sender"] = (
        f"{label} <{address}>"
        if address
        else label
    )
    return TransformationApplication(
        True,
        "The sender display label was changed only on the isolated copy.",
        label,
    )


def _domain_with(address: str) -> Callable[[dict], TransformationApplication]:
    def apply(email: dict) -> TransformationApplication:
        return _sender_domain(email, address)
    return apply


def _sender_domain(email: dict, address: str = "notice@account-services.example") -> TransformationApplication:
    name, _ = parseaddr(email.get("sender", ""))
    email["sender"] = f"{name} <{address}>" if name else address
    return TransformationApplication(
        True,
        "The sender address was changed to a reserved example domain.",
        address,
    )


def _preview_only(component: str, value: str) -> Callable[[dict], TransformationApplication]:
    """Show inert metadata examples; Gmail content is never modified or sent.

    The parser does not expose these as independently writable fields. The
    frontend can still compare display examples without inventing a scored edit.
    """
    def apply(_email: dict) -> TransformationApplication:
        return TransformationApplication(
            True,
            f"{component} was previewed on the temporary copy only; no original file or link was changed.",
            value,
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
    # Sender metadata never enters the current subject/body classifier.
    "sender-unverified": TransformationDefinition("sender_name", False, _label_with("Unverified Account Desk")),
    "sender-label": TransformationDefinition("sender_name", False, _sender_label),
    "sender-friendly": TransformationDefinition("sender_name", False, _label_with("Example Customer Support")),
    "sender-unusual-domain": TransformationDefinition("sender_address", False, _domain_with("notice@unverified-alerts.example")),
    "sender-domain": TransformationDefinition("sender_address", False, _sender_domain),
    "sender-support-domain": TransformationDefinition("sender_address", False, _domain_with("support@service-help.example")),
    "subject-urgent": TransformationDefinition("subject", True, _set_subject("Action requested today: account notice")),
    "subject-format": TransformationDefinition("subject", True, _subject_format),
    "subject-wording": TransformationDefinition("subject", True, _subject_wording),
    "subject-informative": TransformationDefinition("subject", True, _set_subject("Account information for your records")),
    "greeting-impersonal": TransformationDefinition("greeting", True, _greeting_with("Dear Customer,")),
    "greeting-generic": TransformationDefinition("greeting", True, _replace_greeting),
    "greeting-friendly": TransformationDefinition("greeting", True, _greeting_with("Hello there,")),
    "body-pressure": TransformationDefinition("body", True, _set_body(
        "This example account notice asks for quick attention. Unexpected requests should always be checked through a trusted source."
    )),
    "body-rephrase": TransformationDefinition("body", True, _body_rephrase),
    "body-reassuring": TransformationDefinition("body", True, _set_body(
        "This is a sample account update for your records. If it was unexpected, check directly with the service you normally use."
    )),
    "request-pressure": TransformationDefinition("request", True, _request_with(
        "Please review this unexpected notice promptly, and verify it independently."
    )),
    "request-rephrase": TransformationDefinition("request", True, _replace_request),
    "request-independent": TransformationDefinition("request", True, _request_with(
        "If you have questions, contact the service using contact details you already trust."
    )),
    "link-pressure": TransformationDefinition("link_text", False, _preview_only("Link label", "Act now (example label only)")),
    "link-placeholder": TransformationDefinition("link_text", False, _preview_only("Link label", "View information (example label)")),
    "link-independent": TransformationDefinition("link_text", False, _preview_only("Link label", "Open the official service yourself")),
    "attachment-urgent": TransformationDefinition("attachment", False, _preview_only("Attachment name", "URGENT_notice_example.zip")),
    "attachment-label": TransformationDefinition("attachment", False, _preview_only("Attachment name", "sample-document.pdf")),
    "attachment-descriptive": TransformationDefinition("attachment", False, _preview_only("Attachment name", "account-information-example.txt")),
    "signature-pressure": TransformationDefinition("signature", False, _preview_only("Signature", "Example Urgent Response Desk")),
    "signature-fictional": TransformationDefinition("signature", False, _preview_only("Signature", "Example Support Team")),
    "signature-friendly": TransformationDefinition("signature", False, _preview_only("Signature", "Example Customer Care")),
    "layout-compact": TransformationDefinition("formatting", False, _layout("Compact preview spacing was applied.", "compact")),
    "layout-normal": TransformationDefinition("formatting", False, _layout("Standard preview spacing was applied.", "normal")),
    "layout-spacing": TransformationDefinition("formatting", False, _layout("Spacious preview spacing was applied.", "spacious")),
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
