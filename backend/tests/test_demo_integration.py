import unittest

from app.api.demo import demo_emails
from app.api.learning_lab import what_if
from app.models.schemas import WhatIfRequest, WhatIfTransformationRequest
from app.services.classifier_service import classify_email_detailed
from app.services.demo_email_service import (
    DEMO_EMAILS,
    get_demo_experiment_email,
    list_demo_emails,
)
from app.services.learning_lab_service import (
    LearningLabValidationError,
    run_what_if_experiment,
)


def transformation(part: str, transformation_id: str):
    return WhatIfTransformationRequest(
        part=part, transformation_id=transformation_id
    )


class DemoIntegrationTests(unittest.TestCase):
    def test_synthetic_email_retrieval_is_stable_and_clearly_marked(self):
        emails = list_demo_emails()

        self.assertEqual([email.id for email in emails], ["demo-001", "demo-002"])
        self.assertTrue(all(email.source == "demo" for email in emails))
        self.assertEqual(emails[0].threat_category, "phishing")

    def test_demo_email_predictions_come_from_real_classifier(self):
        responses = list_demo_emails()

        for email, response in zip(DEMO_EMAILS, responses, strict=True):
            expected = classify_email_detailed(email.subject, email.classifier_body)
            self.assertEqual(response.classification, expected["classification"])
            self.assertEqual(response.confidence, expected["confidence"])
            self.assertEqual(
                response.malicious_probability,
                expected["malicious_probability"],
            )

        self.assertEqual(responses[0].classification, "Potential threat")
        self.assertEqual(responses[1].classification, "Legitimate")

    def test_demo_experiment_does_not_mutate_original(self):
        before = get_demo_experiment_email("demo-001")

        run_what_if_experiment(
            "demo-001", [transformation("subject", "subject-wording")]
        )

        self.assertEqual(get_demo_experiment_email("demo-001"), before)

    def test_subject_transformation_uses_real_predictions(self):
        result = run_what_if_experiment(
            "demo-001", [transformation("subject", "subject-wording")]
        )
        expected = classify_email_detailed(result.modified_subject, result.modified_body)

        self.assertEqual(result.source, "demo")
        self.assertEqual(result.modified_subject, "A note about your account")
        self.assertEqual(result.modified_values["subject"], result.modified_subject)
        self.assertEqual(
            result.modified_malicious_probability,
            expected["malicious_probability"],
        )
        self.assertEqual(
            result.score_change,
            round(
                result.modified_malicious_probability
                - result.original_malicious_probability,
                2,
            ),
        )

    def test_body_transformation_uses_real_predictions(self):
        result = run_what_if_experiment(
            "demo-001", [transformation("body", "body-rephrase")]
        )
        expected = classify_email_detailed(result.modified_subject, result.modified_body)

        self.assertIn("service you normally use", result.modified_body)
        self.assertEqual(result.modified_values["body"], result.modified_body)
        self.assertEqual(result.modified_values["greeting"], "")
        self.assertEqual(result.modified_values["request"], "")
        self.assertEqual(result.modified_values["signature"], "")
        self.assertEqual(
            result.modified_malicious_probability,
            expected["malicious_probability"],
        )

    def test_demo_requested_action_can_be_reliably_rephrased(self):
        result = run_what_if_experiment(
            "demo-001", [transformation("request", "request-rephrase")]
        )

        applied = result.applied_transformations[0]
        self.assertTrue(applied.applied)
        self.assertTrue(applied.affects_classifier)
        self.assertIn("official service", result.modified_values["request"])
        self.assertIn("official service", result.modified_body)

    def test_demo_api_returns_typed_email_and_what_if_responses(self):
        emails = demo_emails()
        result = what_if(
            WhatIfRequest(
                email_id="demo-001",
                transformations=[
                    transformation("subject", "subject-format")
                ],
            )
        )

        self.assertEqual(len(emails), 2)
        self.assertEqual(result.email_id, "demo-001")
        self.assertTrue(result.applied_transformations[0].applied)

    def test_unsupported_demo_transformation_is_rejected(self):
        with self.assertRaises(LearningLabValidationError):
            run_what_if_experiment(
                "demo-001", [transformation("subject", "unsupported")]
            )


if __name__ == "__main__":
    unittest.main()
