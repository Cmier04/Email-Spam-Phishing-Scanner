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
from app.services.demo_email_service import (
    get_demo_experiment_email,
    is_demo_email_id,
)
from app.services.gmail_service import get_message_by_id, parse_message


class LearningLabValidationError(ValueError):
    """Raised for unsupported, mismatched, or conflicting transformations."""


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


def _replace_request(email: dict) -> TransformationApplication:
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
        return TransformationApplication(
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
    return TransformationApplication(
        True,
        "One clearly identifiable requested-action sentence was replaced.",
        replacement.strip(),
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
) -> WhatIfResponse:
    """Retrieve an email, transform a deep copy, and compare real inference."""
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
        application = definition.apply(modified)
        affects_classifier = definition.affects_classifier and application.applied
        results.append(
            AppliedTransformation(
                part=definition.part,
                transformation_id=transformation_id,
                applied=application.applied,
                affects_classifier=affects_classifier,
                message=application.message,
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
        elif not definition.affects_classifier:
            warnings.append(
                f"{application.message} This transformation does not change the subject/body "
                "input used by the current classifier."
            )

    modified_result = classify_email_detailed(modified["subject"], modified["body"])
    return WhatIfResponse(
        email_id=email_id,
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
    )
