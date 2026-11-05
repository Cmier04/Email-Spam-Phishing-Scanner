import unittest
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError

from app.api.learning_lab import what_if
from app.models.schemas import WhatIfRequest
from app.services.gmail_service import GmailMessageNotFoundError
from app.services.gmail_service import GmailAPIError, GmailConfigurationError
from app.services.learning_lab_service import LearningLabValidationError


def valid_request():
    return WhatIfRequest.model_validate(
        {
            "email_id": "message-1",
            "transformations": [
                {"part": "subject", "transformation_id": "subject-format"}
            ],
        }
    )


class LearningLabAPITests(unittest.TestCase):
    def test_schema_accepts_existing_frontend_request_shape(self):
        parsed = WhatIfRequest.model_validate(
            {
                "email_id": "message-1",
                "transformations": [
                    {
                        "part": "sender_name",
                        "transformation_id": "sender-label",
                    },
                    {
                        "part": "subject",
                        "transformation_id": "subject-wording",
                    },
                ],
            }
        )

        self.assertEqual(parsed.email_id, "message-1")
        self.assertEqual(len(parsed.transformations), 2)

    def test_schema_rejects_empty_or_malformed_frontend_requests(self):
        invalid_requests = [
            {"email_id": "", "transformations": []},
            {"email_id": "message-1", "transformations": []},
            {
                "email_id": "message-1",
                "transformations": [{"part": "", "transformation_id": ""}],
            },
        ]

        for payload in invalid_requests:
            with self.subTest(payload=payload), self.assertRaises(ValidationError):
                WhatIfRequest.model_validate(payload)

    def test_validation_error_is_returned_as_http_400(self):
        with patch(
            "app.api.learning_lab.run_what_if_experiment",
            side_effect=LearningLabValidationError("bad pairing"),
        ):
            with self.assertRaises(HTTPException) as raised:
                what_if(valid_request())

        self.assertEqual(raised.exception.status_code, 400)
        self.assertEqual(raised.exception.detail, "bad pairing")

    def test_missing_message_is_returned_as_http_404(self):
        with patch(
            "app.api.learning_lab.run_what_if_experiment",
            side_effect=GmailMessageNotFoundError("missing"),
        ):
            with self.assertRaises(HTTPException) as raised:
                what_if(valid_request())

        self.assertEqual(raised.exception.status_code, 404)
        self.assertEqual(raised.exception.detail, "missing")

    def test_backend_reports_gmail_configuration_and_upstream_errors_safely(self):
        cases = [
            (GmailConfigurationError("OAuth is not configured."), 503),
            (GmailAPIError("private upstream detail"), 502),
        ]

        for error, expected_status in cases:
            with self.subTest(error=type(error).__name__), patch(
                "app.api.learning_lab.run_what_if_experiment",
                side_effect=error,
            ):
                with self.assertRaises(HTTPException) as raised:
                    what_if(valid_request())
                self.assertEqual(raised.exception.status_code, expected_status)
                self.assertNotIn("private upstream detail", raised.exception.detail)


if __name__ == "__main__":
    unittest.main()
