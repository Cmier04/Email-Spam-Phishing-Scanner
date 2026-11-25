"""Evidence-based Learning Lab summaries, generated entirely on the local backend.

This service does not call an AI model or any remote API. It summarizes
verified experiment facts and the independent rule-based email indicators.
It does not claim to explain the internal reasoning of the classifier.
"""

from __future__ import annotations

from typing import Any, Mapping

from app.models.schemas import AppliedTransformation, LearningSummary
from app.services.email_analysis_service import analyze_email

_MAX_FINDINGS = 3


def _indicators(message: Mapping[str, Any]) -> dict[str, str]:
    """Return only server-authored indicator descriptions, not email text."""
    observations = analyze_email(message).get("indicators", [])
    return {
        item["code"]: item["title"]
        for item in observations
        if isinstance(item, dict) and item.get("code") and item.get("title")
    }


def _describe_delta(before: float, after: float) -> str:
    delta = after - before
    if abs(delta) < 0.005:
        return "stayed the same at the displayed precision"
    return f"{'increased' if delta > 0 else 'decreased'} by {abs(delta):.2f} percentage points"


def build_dynamic_summary(
    *,
    applied: list[AppliedTransformation],
    original: Mapping[str, Any],
    modified: Mapping[str, Any],
    original_probability: float,
    modified_probability: float,
    decision_changed: bool,
) -> LearningSummary:
    """Summarize the actual edits, measured scores, and observed warning signs.

    The same input produces the same summary. Only the existing classifier
    supplies the probabilities. rules supply independently observed
    indicators; neither source is used to claim individual-word causation.
    """
    successful = [change for change in applied if change.applied]
    text_edits = [change for change in successful if change.affects_classifier]
    classifier_input_changed = any(
        original.get(field, "") != modified.get(field, "")
        for field in ("subject", "body")
    )
    changes = [change.message for change in successful] or [
        "No requested changes could be applied to this email."
    ]
    score_change = modified_probability - original_probability
    score_sentence = (
        "The classifier's estimated malicious probability "
        + _describe_delta(original_probability, modified_probability)
        + "."
    )

    if not successful:
        effect = "The original email was unchanged. " + score_sentence
    elif not classifier_input_changed:
        if text_edits:
            effect = (
                "The selected text edit did not change the actual subject or body, "
                "so the classifier received identical input. "
            )
        else:
            effect = (
                "These changes affected only displayed metadata or formatting, "
                "not the subject or body used by the current classifier. "
            )
        if abs(score_change) < 0.005:
            effect += "The classifier's estimated malicious probability remained unchanged."
        else:
            effect += (
                score_sentence
                + " This difference cannot be attributed to the requested edits; "
                "verify that the classifier is producing repeatable results."
            )
    else:
        effect = "After the subject or body was edited, " + score_sentence[0].lower() + score_sentence[1:]
        if decision_changed:
            effect += " The model's predicted category also changed."
        if len(text_edits) > 1:
            effect += (
                " Multiple text edits were applied together, so this experiment "
                "cannot isolate the effect of any single edit."
            )
        else:
            effect += (
                " The comparison does not establish which individual words "
                "influenced the prediction."
            )

    before = _indicators(original)
    after = _indicators(modified)
    removed = [title for code, title in before.items() if code not in after][:_MAX_FINDINGS]
    added = [title for code, title in after.items() if code not in before][:_MAX_FINDINGS]
    # These observations are independent of classifier inference; no causal
    # attribution is made between warning signs and the measured ML score.
    if removed:
        effect += " Separate rule-based checks no longer flagged: " + "; ".join(removed) + "."
    if added:
        effect += " Separate rule-based checks newly flagged: " + "; ".join(added) + "."

    relevant = list(before.values())[:_MAX_FINDINGS] or list(after.values())[:_MAX_FINDINGS]
    if relevant:
        lesson = (
            "Review the observed email indicators ("
            + "; ".join(relevant)
            + ") and verify unexpected requests using a trusted source. "
        )
    else:
        lesson = (
            "No indicators matched the current rule-based checks, but that "
            "does not prove the email is safe. Verify unexpected requests independently. "
        )
    if not text_edits:
        lesson += "Changes to appearance or sender metadata do not affect this subject/body classifier."
    elif not classifier_input_changed:
        lesson += "The selected edit left the classifier's subject/body input unchanged."
    else:
        lesson += "A classifier score is an estimate, not proof of an email's safety."

    return LearningSummary(
        source="dynamic",
        changes_made=changes,
        why_it_mattered=effect,
        what_you_should_learn=lesson.strip(),
    )
