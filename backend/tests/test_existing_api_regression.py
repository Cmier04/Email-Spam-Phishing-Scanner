import unittest
from unittest.mock import patch

from app.api.classify import classify
from app.api.gmail import latest_gmail_message, recent_gmail_messages
from app.main import app
from app.models.schemas import EmailClassificationRequest


class ExistingAPIRegressionTests(unittest.TestCase):
    def test_existing_routes_remain_registered(self):
        paths = app.openapi()["paths"]

        self.assertIn("post", paths["/api/classify"])
        self.assertIn("get", paths["/api/gmail/latest"])
        self.assertIn("get", paths["/api/gmail/recent"])
        self.assertIn("post", paths["/api/what-if"])

    def test_classify_endpoint_preserves_service_result(self):
        expected = {"classification": "Legitimate", "confidence": 91.5}
        with patch("app.api.classify.classify_email", return_value=expected) as service:
            result = classify(
                EmailClassificationRequest(subject="Status", body="All is well")
            )

        service.assert_called_once_with("Status", "All is well")
        self.assertEqual(result, expected)

    def test_latest_gmail_endpoint_preserves_service_result(self):
        expected = {"id": "latest"}
        with patch("app.api.gmail.scan_latest_message", return_value=expected):
            self.assertEqual(latest_gmail_message(), expected)

    def test_recent_gmail_endpoint_preserves_limit_and_service_result(self):
        expected = [{"id": "one"}, {"id": "two"}]
        with patch("app.api.gmail.scan_recent_messages", return_value=expected) as service:
            result = recent_gmail_messages(limit=2)

        service.assert_called_once_with(max_results=2)
        self.assertEqual(result, expected)


if __name__ == "__main__":
    unittest.main()
