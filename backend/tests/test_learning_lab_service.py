import base64
import unittest
from copy import deepcopy
from unittest.mock import call, patch

from app.models.schemas import WhatIfTransformationRequest
from app.services.gmail_service import GmailMessageNotFoundError
from app.services.learning_lab_service import (
    LearningLabValidationError,
    TRANSFORMATIONS,
    run_what_if_experiment,
)


def gmail_message(subject="URGENT NOTICE", body="Hello Alex,\nPlease verify now."):
    encoded = base64.urlsafe_b64encode(body.encode()).decode().rstrip("=")
    return {
        "id": "message-1",
        "payload": {
            "headers": [
                {"name": "Subject", "value": subject},
                {"name": "From", "value": "Security <alert@sender.test>"},
            ],
            "mimeType": "text/plain",
            "body": {"data": encoded},
        },
    }


def request(part, transformation_id):
    return WhatIfTransformationRequest(
        part=part, transformation_id=transformation_id
    )


def classifier_side_effect(subject, body):
    malicious = 90.0 if "URGENT" in subject else 25.0
    classification = "Potential threat" if malicious >= 50 else "Legitimate"
    return {
        "classification": classification,
        "confidence": malicious if classification == "Potential threat" else 100 - malicious,
        "malicious_probability": malicious,
    }


class LearningLabServiceTests(unittest.TestCase):
    def test_registry_exactly_matches_frontend_transformation_contract(self):
        expected = {
            "sender-label": "sender_name",
            "sender-domain": "sender_address",
            "subject-format": "subject",
            "subject-wording": "subject",
            "greeting-generic": "greeting",
            "body-rephrase": "body",
            "request-rephrase": "request",
            "link-placeholder": "link_text",
            "attachment-label": "attachment",
            "signature-fictional": "signature",
            "layout-spacing": "formatting",
            "layout-compact": "formatting",
        }

        self.assertEqual(
            {key: definition.part for key, definition in TRANSFORMATIONS.items()},
            expected,
        )

    def run_experiment(self, transformations, message=None):
        source = message or gmail_message()
        with (
            patch(
                "app.services.learning_lab_service.get_message_by_id",
                return_value=source,
            ),
            patch(
                "app.services.learning_lab_service.classify_email_detailed",
                side_effect=classifier_side_effect,
            ) as classify,
        ):
            result = run_what_if_experiment("message-1", transformations)
        return result, classify

    def test_valid_subject_transformation_and_classifier_input(self):
        result, classify = self.run_experiment(
            [request("subject", "subject-wording")]
        )

        self.assertEqual(result.modified_subject, "A note about your account")
        self.assertEqual(
            classify.call_args_list,
            [
                call("URGENT NOTICE", "Hello Alex,\nPlease verify now."),
                call("A note about your account", "Hello Alex,\nPlease verify now."),
            ],
        )
        self.assertEqual(result.score_change, -65.0)
        self.assertTrue(result.decision_changed)

    def test_valid_body_transformation(self):
        result, _ = self.run_experiment([request("body", "body-rephrase")])

        self.assertIn("service you normally use", result.modified_body)
        self.assertTrue(result.applied_transformations[0].affects_classifier)

    def test_multiple_transformations_use_canonical_order(self):
        result, _ = self.run_experiment(
            [
                request("body", "body-rephrase"),
                request("subject", "subject-format"),
            ]
        )

        self.assertEqual(
            [item.transformation_id for item in result.applied_transformations],
            ["subject-format", "body-rephrase"],
        )
        self.assertEqual(result.modified_subject, "urgent notice")

    def test_invalid_transformation_id_is_rejected(self):
        with self.assertRaisesRegex(LearningLabValidationError, "Unsupported"):
            self.run_experiment([request("subject", "made-up")])

    def test_incorrect_component_pairing_is_rejected(self):
        with self.assertRaisesRegex(LearningLabValidationError, "only valid"):
            self.run_experiment([request("body", "subject-wording")])

    def test_conflicting_transformations_are_rejected(self):
        with self.assertRaisesRegex(LearningLabValidationError, "Conflicting"):
            self.run_experiment(
                [
                    request("subject", "subject-format"),
                    request("subject", "subject-wording"),
                ]
            )

    def test_whole_body_and_semantic_slice_are_rejected_as_conflicting(self):
        with self.assertRaisesRegex(LearningLabValidationError, "whole-body"):
            self.run_experiment(
                [
                    request("body", "body-rephrase"),
                    request("request", "request-rephrase"),
                ]
            )

    def test_unavailable_semantic_component_is_reported_without_body_change(self):
        message = gmail_message(body="This message has no greeting or salutation.")
        result, _ = self.run_experiment(
            [request("greeting", "greeting-generic")], message
        )

        applied = result.applied_transformations[0]
        self.assertFalse(applied.applied)
        self.assertFalse(applied.affects_classifier)
        self.assertEqual(result.modified_body, "This message has no greeting or salutation.")
        self.assertIn("No clearly identifiable greeting", result.warnings[0])

    def test_metadata_only_transformation_does_not_change_classifier_input(self):
        result, classify = self.run_experiment(
            [request("sender_address", "sender-domain")]
        )

        self.assertEqual(classify.call_args_list[0], classify.call_args_list[1])
        self.assertEqual(result.score_change, 0.0)
        self.assertFalse(result.decision_changed)
        self.assertFalse(result.applied_transformations[0].affects_classifier)

    def test_formatting_only_transformation_has_no_model_impact(self):
        result, classify = self.run_experiment(
            [request("formatting", "layout-compact")]
        )

        self.assertEqual(classify.call_args_list[0], classify.call_args_list[1])
        self.assertEqual(result.score_change, 0.0)
        self.assertTrue(result.applied_transformations[0].applied)

    def test_original_email_is_immutable(self):
        source = gmail_message()
        before = deepcopy(source)

        self.run_experiment([request("body", "body-rephrase")], source)

        self.assertEqual(source, before)

    def test_no_classification_change_is_reported(self):
        result, _ = self.run_experiment([request("subject", "subject-format")])

        self.assertEqual(result.original_classification, "Potential threat")
        self.assertEqual(result.modified_classification, "Legitimate")
        # Lowercasing removes the fake scorer's uppercase trigger.
        self.assertTrue(result.decision_changed)

        unchanged, _ = self.run_experiment(
            [request("formatting", "layout-spacing")]
        )
        self.assertFalse(unchanged.decision_changed)

    def test_missing_gmail_message_is_propagated(self):
        with patch(
            "app.services.learning_lab_service.get_message_by_id",
            side_effect=GmailMessageNotFoundError("missing"),
        ):
            with self.assertRaises(GmailMessageNotFoundError):
                run_what_if_experiment(
                    "missing", [request("subject", "subject-format")]
                )


if __name__ == "__main__":
    unittest.main()
