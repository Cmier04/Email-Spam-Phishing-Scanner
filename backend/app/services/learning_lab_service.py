"""Safe, deterministic transformations for isolated Learning Lab copies."""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from email.utils import parseaddr
import re
from typing import Callable

from app.models.schemas import (
    AppliedTransformation,
    WhatIfResponse,
    WhatIfTransformationRequest,
)
from app.services.classifier_service import classify_email_detailed
from app.services.gmail_service import get_message_by_id, parse_message


class LearningLabValidationError(ValueError):
    """Raised for unsupported, mismatched, or conflicting transformations."""


@dataclass(frozen=True)
class TransformationDefinition:
    part: str
    affects_classifier: bool
    apply: Callable[[dict], tuple[bool, str]]


def _subject_format(email: dict) -> tuple[bool, str]:
    email["subject"] = email["subject"].lower()
    return True, "Subject capitalization was normalized."


def _subject_wording(email: dict) -> tuple[bool, str]:
    email["subject"] = "A note about your account"
    return True, "Subject wording was replaced with the predefined neutral text."


def _body_rephrase(email: dict) -> tuple[bool, str]:
    email["body"] = (
        "We noticed a recent change associated with your account. "
        "Review your account through the service you normally use."
    )
    return True, "The complete message body was replaced with predefined text."


def _replace_greeting(email: dict) -> tuple[bool, str]:
    body = email["body"]
    match = re.match(
        r"^(\s*)(dear|hello|hi|good morning|good afternoon|good evening)"
        r"[^\r\n]{0,80}[,:](?=\s|$)",
        body,
        flags=re.IGNORECASE,
    )
    if not match:
        return (
            False,
            "No clearly identifiable greeting was found at the start of the body.",
        )
    email["body"] = f"{match.group(1)}Hello," + body[match.end():]
    return True, "The greeting at the start of the body was replaced."


def _replace_request(email: dict) -> tuple[bool, str]:
    body = email["body"]
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
    if len(matches) != 1:
        return (
            False,
            "A single unambiguous requested-action sentence could not be identified.",
        )
    sentence = matches[0]
    replacement = (
        " If this activity was unexpected, review your account using the official "
        "service."
    )
    email["body"] = (
        body[:sentence.start()] + replacement.lstrip() + body[sentence.end():]
    )
    return True, "One clearly identifiable requested-action sentence was replaced."


def _sender_label(email: dict) -> tuple[bool, str]:
    _, address = parseaddr(email.get("sender", ""))
    email["sender"] = (
        f"Example Account Services <{address}>"
        if address
        else "Example Account Services"
    )
    return True, "The sender display label was changed only on the isolated copy."


def _sender_domain(email: dict) -> tuple[bool, str]:
    name, _ = parseaddr(email.get("sender", ""))
    address = "notice@account-services.example"
    email["sender"] = f"{name} <{address}>" if name else address
    return True, "The sender address was changed to a reserved example domain."


def _unavailable(component: str) -> Callable[[dict], tuple[bool, str]]:
    def apply(_email: dict) -> tuple[bool, str]:
        return (
            False,
            f"{component} is not exposed as a separate field by the Gmail parser, "
            "so unrelated body text was left unchanged.",
        )

    return apply


def _layout(description: str) -> Callable[[dict], tuple[bool, str]]:
    def apply(_email: dict) -> tuple[bool, str]:
        return True, description

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
        _layout("Spacious layout was recorded for the frontend preview."),
    ),
    "layout-compact": TransformationDefinition(
        "formatting",
        False,
        _layout("Compact layout was recorded for the frontend preview."),
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
) -> WhatIfResponse:
    """Retrieve an email, transform a deep copy, and compare real inference."""
    ordered = _validate_and_order(transformations)
    original = parse_message(get_message_by_id(email_id))
    modified = deepcopy(original)
    original_result = classify_email_detailed(original["subject"], original["body"])

    results: list[AppliedTransformation] = []
    warnings: list[str] = []
    for transformation_id, definition in ordered:
        applied, message = definition.apply(modified)
        affects_classifier = definition.affects_classifier and applied
        results.append(
            AppliedTransformation(
                part=definition.part,
                transformation_id=transformation_id,
                applied=applied,
                affects_classifier=affects_classifier,
                message=message,
            )
        )
        if not applied:
            warnings.append(message)
        elif not definition.affects_classifier:
            warnings.append(
                f"{message} This transformation does not change the subject/body "
                "input used by the current classifier."
            )

    modified_result = classify_email_detailed(modified["subject"], modified["body"])
    return WhatIfResponse(
        email_id=email_id,
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
        warnings=warnings,
    )
