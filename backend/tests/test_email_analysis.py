"""checks: email-specific observations are independent of ML scores."""

import base64
import unittest
from unittest.mock import patch

from app.models.schemas import GmailMessageResponse
from app.services.email_analysis_service import analyze_email
from app.services.gmail_service import parse_message, scan_message
from app.services.demo_email_service import list_demo_emails
from app.main import app
from fastapi.testclient import TestClient


def _encoded(text):
    return base64.urlsafe_b64encode(text.encode("utf-8")).decode("ascii").rstrip("=")


class EmailAnalysisTests(unittest.TestCase):
    def test_different_messages_have_different_evidence_and_recommendations(self):
        phish = analyze_email({
            "subject": "URGENT: final notice",
            "body": "Please provide your password within 24 hours to avoid suspension.",
            "sender_address": "support@other.example",
            "links": [{
                "display_text": "https://accounts.example.org/login",
                "url": "https://attacker.test/login",
            }],
            "attachments": [{"filename": "statement.pdf.exe"}],
        })
        benign = analyze_email({
            "subject": "Weekly team updates",
            "body": "Here are the notes from our project meeting.",
            "sender_address": "colleague@example.org",
            "links": [{
                "display_text": "Project notes",
                "url": "https://example.org/notes",
            }],
            "attachments": [{"filename": "agenda.pdf"}],
        })
        ids = {item["code"] for item in phish["indicators"]}
        self.assertEqual(ids, {
            "sensitive-information-request", "urgent-language",
            "visible-link-destination-mismatch", "executable-attachment",
        })
        self.assertTrue(phish["recommendations"])
        self.assertEqual(benign["indicators"], [])
        self.assertEqual(benign["recommendations"], [])
        self.assertIn("not proof", benign["note"])

    def test_security_advice_is_not_a_password_request(self):
        observations = analyze_email({
            "subject": "Security best practices",
            "body": "Never share your password. Do not provide your verification code.",
        })
        self.assertEqual(observations["indicators"], [])

    def test_reply_to_and_sender_claim_are_limited_observations(self):
        observations = analyze_email({
            "sender_name": "bank.example.com",
            "sender_address": "someone@random.example.net",
            "reply_to": "fraud@separate.example.org",
        })
        ids = {item["code"] for item in observations["indicators"]}
        self.assertIn("reply-to-domain-difference", ids)
        self.assertIn("sender-name-domain-difference", ids)
        self.assertIn("legitimate", observations["indicators"][0]["description"].lower())

    def test_link_username_and_ip_address_do_not_cause_web_requests(self):
        observations = analyze_email({
            "links": [
                {"display_text": "Sign in", "url": "https://trusted.example@127.0.0.1/login"},
                {"display_text": "View terms", "url": "https://example.org/policy"},
            ]
        })
        ids = {item["code"] for item in observations["indicators"]}
        self.assertEqual(ids, {"link-userinfo", "link-ip-address"})

    def test_malformed_and_missing_fields_are_handled(self):
        self.assertEqual(analyze_email({})["indicators"], [])
        self.assertEqual(analyze_email({"links": [None, {}, {"url": "http://[broken"}]} )["indicators"], [])
        self.assertEqual(analyze_email({"attachments": [None, {}, {"filename": 42}]} )["indicators"], [])

    def test_invoice_and_deceptive_link_only_raise_the_relevant_signals(self):
        result = analyze_email({
            "body": "Please pay your invoice for this month.",
            "links": [{"display_text": "Pay online", "url": "https://example.com/pay"}],
            "attachments": [{"filename": "receipt.pdf"}],
        })
        self.assertEqual([i["code"] for i in result["indicators"]], ["payment-request"])

    def test_gmail_parser_exposes_reply_to(self):
        parsed = parse_message({"payload": {
            "mimeType": "text/plain",
            "headers": [
                {"name": "From", "value": "Support <support@example.com>"},
                {"name": "Reply-To", "value": "Help <help@other.example>"},
            ],
            "body": {"data": _encoded("Please review the agenda.")},
        }})
        self.assertEqual(parsed["reply_to"], "Help <help@other.example>")

    def test_scan_message_does_not_change_classifier_input_or_score(self):
        message = {"id": "abc", "threadId": "thread", "payload": {
            "mimeType": "text/plain",
            "headers": [{"name": "Subject", "value": "URGENT notice"}],
            "body": {"data": _encoded("Please provide your password immediately.")},
        }}
        with patch("app.services.gmail_service.classify_email", return_value={
            "classification": "Legitimate", "confidence": 77.0,
        }) as classify:
            result = scan_message(message)
        classify.assert_called_once_with("URGENT notice", "Please provide your password immediately.")
        self.assertEqual(result["classification"], "Legitimate")
        self.assertEqual(result["confidence"], 77.0)
        self.assertIn("sensitive-information-request", {
            item["code"] for item in result["security_analysis"]["indicators"]
        })
        serialized = GmailMessageResponse(**result).model_dump()
        self.assertEqual(serialized["security_analysis"]["indicators"][0]["category"], "language")
        self.assertIsInstance(serialized["security_analysis"]["recommendations"], list)

    def test_demo_emails_also_have_email_specific_evidence(self):
        demo = list_demo_emails()
        first_codes = {i.code for i in demo[0].security_analysis.indicators}
        second_codes = {i.code for i in demo[1].security_analysis.indicators}
        self.assertIn("urgent-language", first_codes)
        self.assertIn("sensitive-information-request", first_codes)
        self.assertEqual(second_codes, set())
        self.assertEqual(demo[0].classification, "Potential threat")

    def test_gmail_endpoint_serializes_evidence_without_change_to_existing_fields(self):
        message = {"id": "one", "thread_id": "t", "sender": "Team <team@example.org>",
                   "recipient": "owner@example.org", "subject": "Important",
                   "date": "", "snippet": "", "body": "Please send your password now.",
                   "classification": "Legitimate", "confidence": 89.0,
                   "security_analysis": analyze_email({"body": "Please send your password now."})}
        with patch("app.api.gmail.scan_recent_messages", return_value=[message]):
            response = TestClient(app).get("/api/gmail/recent?limit=1")
        self.assertEqual(response.status_code, 200)
        item = response.json()[0]
        self.assertEqual(item["classification"], "Legitimate")
        self.assertEqual(item["confidence"], 89.0)
        self.assertEqual(item["security_analysis"]["indicators"][0]["code"], "sensitive-information-request")
        self.assertIsInstance(item["security_analysis"]["recommendations"], list)

    def test_response_schema_backward_compatible_with_original(self):
        response = GmailMessageResponse(
            id="old", thread_id="", sender="", recipient="", subject="",
            date="", snippet="", body="", classification="Legitimate",
            confidence=100,
        )
        self.assertEqual(response.security_analysis.indicators, [])
        self.assertEqual(response.reply_to, "")


if __name__ == "__main__":
    unittest.main()
