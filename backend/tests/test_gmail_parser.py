"""real-message parsing contract tests (no Gmail account required)."""
import base64
import unittest

from app.models.schemas import GmailMessageResponse
from app.services.gmail_service import decode_body, extract_body, parse_message


def encoded(text: str, charset: str = "utf-8") -> str:
    return base64.urlsafe_b64encode(text.encode(charset)).decode("ascii").rstrip("=")


class GmailParserTests(unittest.TestCase):
    def test_html_only_extracts_real_body_links_and_signature(self):
        message = {
            "id": "html-1", "threadId": "thread-1", "snippet": "Hello&nbsp;Alex",
            "payload": {
                "mimeType": "text/html",
                "headers": [
                    {"name": "From", "value": '"Account Security" <security@example.com>'},
                    {"name": "Subject", "value": "Please verify your account"},
                    {"name": "To", "value": "alex@example.com"},
                ],
                "body": {"data": encoded(
                    "<html><head><style>.bad{}</style></head><body>"
                    "<p>Hello Alex,</p><p>Please verify your account by visiting "
                    "<a href='https://example.com/account?x=1&amp;y=2'>Review account</a>."
                    "</p><p>Regards,<br>Example Security Team</p>"
                    "<script>alert('hidden');</script></body></html>"
                )},
            },
        }
        parsed = parse_message(message)
        self.assertEqual(parsed["sender_name"], "Account Security")
        self.assertEqual(parsed["sender_address"], "security@example.com")
        self.assertEqual(parsed["greeting"], "Hello Alex,")
        self.assertIn("Please verify your account", parsed["request"])
        self.assertIn("Review account", parsed["body"])
        self.assertNotIn("alert(", parsed["body"])
        self.assertNotIn(".bad", parsed["body"])
        self.assertEqual(parsed["signature"], "Example Security Team")
        self.assertEqual(parsed["snippet"], "Hello Alex")
        self.assertEqual(parsed["link_text"], "Review account")
        self.assertEqual(parsed["links"][0], {
            "display_text": "Review account", "url": "https://example.com/account?x=1&y=2"
        })
        self.assertEqual(parsed["attachments"], [])

    def test_multipart_plain_is_used_once_and_named_attachment_is_metadata_only(self):
        payload = {
            "mimeType": "multipart/mixed",
            "parts": [
                {"mimeType": "multipart/alternative", "parts": [
                    {"mimeType": "text/html", "body": {"data": encoded(
                        '<p>HTML copy</p><a href="https://example.com/review">View details</a>'
                    )}},
                    {"mimeType": "text/plain", "body": {"data": encoded(
                        "Hello,\nReview your travel booking before departure.\n\nThanks,\nTravel Team"
                    )}},
                ]},
                {"mimeType": "application/pdf", "filename": "Flight details.pdf",
                 "body": {"attachmentId": "opaque-download-key", "size": 2732}},
                {"mimeType": "image/png", "filename": "logo.png",
                 "headers": [{"name": "Content-Disposition", "value": "inline; filename=logo.png"}],
                 "body": {"attachmentId": "opaque-image-key", "size": 312}},
                {"mimeType": "message/rfc822", "filename": "other.eml", "parts": [
                    {"mimeType": "text/html", "body": {"data": encoded(
                        '<a href="https://do-not-include.example">Danger</a>'
                    )}},
                ]},
            ],
        }
        parsed = parse_message({"id": "mail-2", "payload": payload})
        self.assertNotIn("HTML copy", parsed["body"])
        self.assertIn("Review your travel booking", parsed["body"])
        self.assertNotIn("Danger", parsed["body"])
        self.assertEqual(parsed["links"], [{"display_text": "View details", "url": "https://example.com/review"}])
        self.assertEqual(parsed["attachment"], "Flight details.pdf")
        self.assertEqual(parsed["attachments"], [
            {"filename": "Flight details.pdf", "mime_type": "application/pdf", "size": 2732},
            {"filename": "other.eml", "mime_type": "message/rfc822", "size": 0},
        ])
        self.assertEqual(parsed["signature"], "Travel Team")

    def test_multiple_independent_plain_parts_are_preserved(self):
        payload = {"mimeType": "multipart/mixed", "parts": [
            {"mimeType": "text/plain", "body": {"data": encoded("First section")}},
            {"mimeType": "text/plain", "body": {"data": encoded("Second section")}},
        ]}
        self.assertEqual(extract_body(payload), "First section\n\nSecond section")

    def test_encoded_headers_and_charsets(self):
        payload = {
            "mimeType": "text/plain",
            "headers": [
                {"name": "From", "value": "=?UTF-8?B?Sm9zw6kgU3VwcG9ydA==?= <jose@example.org>"},
                {"name": "Subject", "value": "=?utf-8?B?Q2Fmw6kgcmVjZWlwdA==?="},
                {"name": "Content-Type", "value": 'text/plain; charset="iso-8859-1"'},
            ],
            "body": {"data": encoded("Café receipt arrived.", "iso-8859-1")},
        }
        parsed = parse_message({"payload": payload})
        self.assertEqual(parsed["sender_name"], "José Support")
        self.assertEqual(parsed["sender_address"], "jose@example.org")
        self.assertEqual(parsed["subject"], "Café receipt")
        self.assertEqual(parsed["body"], "Café receipt arrived.")
        self.assertEqual(parsed["greeting"], "")
        self.assertEqual(parsed["request"], "")
        self.assertEqual(parsed["signature"], "")
        self.assertEqual(decode_body(encoded("Hi"), charset="unknown-charset"), "Hi")

    def test_hidden_html_preheader_text_and_hidden_links_are_ignored(self):
        message = {"payload": {"mimeType": "text/html", "body": {"data": encoded(
            "<div style='display: none'><a href='https://hidden.example/'>"
            "Hidden offer</a>&zwnj;&zwnj;</div>"
            "<p>Hi Nina,</p><p>Review the schedule.</p>"
            "<a href='https://example.org/schedule'>Schedule</a>"
        )}}}
        result = parse_message(message)
        self.assertNotIn("Hidden offer", result["body"])
        self.assertEqual(result["links"], [
            {"display_text": "Schedule", "url": "https://example.org/schedule"}
        ])
        self.assertEqual(result["greeting"], "Hi Nina,")

    def test_no_fabricated_greeting_request_links_or_signature(self):
        parsed = parse_message({"id": "empty", "payload": {
            "mimeType": "text/plain",
            "headers": [{"name": "Subject", "value": "Calendar summary"}],
            "body": {"data": encoded("The team met at 10. The notes are attached tomorrow.")},
        }})
        for key in ("greeting", "request", "signature", "link_text", "attachment"):
            self.assertEqual(parsed[key], "")
        self.assertEqual(parsed["links"], [])
        self.assertEqual(parsed["attachments"], [])

    def test_plain_urls_deduplicate_and_unsafe_html_targets_ignored(self):
        message = {"payload": {"mimeType": "multipart/alternative", "parts": [
            {"mimeType": "text/plain", "body": {"data": encoded(
                "Visit https://example.org/verify. Then visit https://example.org/verify."
            )}},
            {"mimeType": "text/html", "body": {"data": encoded(
                "<a href='javascript:alert(1)'>Fake</a>"
            )}},
        ]}}
        parsed = parse_message(message)
        self.assertEqual(parsed["links"], [{
            "display_text": "https://example.org/verify", "url": "https://example.org/verify"
        }])

    def test_api_response_accepts_new_structured_fields(self):
        parsed = parse_message({"payload": {}})
        response = GmailMessageResponse(**parsed, classification="Legitimate", confidence=92.5)
        self.assertEqual(response.links, [])
        self.assertEqual(response.sender_name, "")
        self.assertEqual(response.greeting, "")


if __name__ == "__main__":
    unittest.main()
