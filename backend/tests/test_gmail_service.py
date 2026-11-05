import base64
import unittest
from unittest.mock import patch

from app.services.gmail_service import (
    NoGmailMessagesError,
    decode_body,
    extract_body,
    get_header,
    get_latest_message,
    get_recent_messages,
    parse_message,
    scan_message,
)


def encode_body(value: str) -> str:
    return (
        base64.urlsafe_b64encode(value.encode("utf-8"))
        .decode("ascii")
        .rstrip("=")
    )


class FakeRequest:
    def __init__(self, response):
        self.response = response

    def execute(self):
        return self.response


class FakeMessages:
    def __init__(self, message_refs, messages):
        self.message_refs = message_refs
        self.messages = messages
        self.list_arguments = None
        self.get_arguments = []

    def list(self, **kwargs):
        self.list_arguments = kwargs
        return FakeRequest({"messages": self.message_refs})

    def get(self, **kwargs):
        self.get_arguments.append(kwargs)
        return FakeRequest(self.messages[kwargs["id"]])


class FakeUsers:
    def __init__(self, messages):
        self._messages = messages

    def messages(self):
        return self._messages


class FakeGmailService:
    def __init__(self, message_refs, messages):
        self.message_resource = FakeMessages(message_refs, messages)
        self.user_resource = FakeUsers(self.message_resource)

    def users(self):
        return self.user_resource


class GmailMessageParsingTests(unittest.TestCase):
    def test_get_header_is_case_insensitive_and_handles_missing_headers(self):
        headers = [
            {"name": "fRoM", "value": "sender@example.com"},
            {"name": "Subject", "value": "Account notice"},
        ]

        self.assertEqual(get_header(headers, "From"), "sender@example.com")
        self.assertEqual(get_header(headers, "subject"), "Account notice")
        self.assertEqual(get_header(headers, "To"), "")
        self.assertEqual(get_header(None, "To"), "")
        self.assertEqual(get_header([None, {}], "To"), "")

    def test_decode_body_handles_urlsafe_base64_and_bad_or_missing_data(self):
        self.assertEqual(decode_body(encode_body("Hello, Gmail!")), "Hello, Gmail!")
        self.assertEqual(decode_body(encode_body("\u083e")), "\u083e")
        self.assertEqual(decode_body(None), "")
        self.assertEqual(decode_body("not valid base64!"), "")
        self.assertEqual(decode_body("\N{SNOWMAN}"), "")

    def test_extract_body_recurses_and_prefers_plain_text(self):
        payload = {
            "mimeType": "multipart/mixed",
            "parts": [
                {
                    "mimeType": "multipart/alternative",
                    "parts": [
                        {
                            "mimeType": "text/html",
                            "body": {"data": encode_body("<p>HTML version</p>")},
                        },
                        {
                            "mimeType": "text/plain",
                            "body": {"data": encode_body("Plain version")},
                        },
                    ],
                }
            ],
        }

        self.assertEqual(extract_body(payload), "Plain version")

    def test_extract_body_uses_readable_html_fallback(self):
        payload = {
            "mimeType": "text/html",
            "body": {
                "data": encode_body(
                    "<style>hidden</style><p>Hello <strong>there</strong>.</p>"
                )
            },
        }

        self.assertEqual(extract_body(payload), "Hello there .")

    def test_extract_body_ignores_named_attachments_in_multipart_mixed(self):
        payload = {
            "mimeType": "multipart/mixed",
            "parts": [
                {
                    "mimeType": "text/plain",
                    "body": {"data": encode_body("Displayed message")},
                },
                {
                    "mimeType": "message/rfc822",
                    "filename": "forwarded.eml",
                    "parts": [
                        {
                            "mimeType": "text/plain",
                            "body": {"data": encode_body("Attachment contents")},
                        }
                    ],
                },
            ],
        }

        self.assertEqual(extract_body(payload), "Displayed message")

    def test_parse_message_safely_defaults_missing_fields(self):
        parsed = parse_message({"id": "message-1", "payload": {}})

        self.assertEqual(
            parsed,
            {
                "id": "message-1",
                "thread_id": "",
                "sender": "",
                "recipient": "",
                "subject": "",
                "date": "",
                "snippet": "",
                "body": "",
            },
        )

    def test_parse_message_normalizes_explicit_null_and_malformed_fields(self):
        parsed = parse_message(
            {
                "id": None,
                "threadId": None,
                "snippet": None,
                "payload": {
                    "headers": [
                        None,
                        {"name": "Subject", "value": None},
                    ],
                    "parts": [None],
                },
            }
        )

        self.assertEqual(parsed["id"], "")
        self.assertEqual(parsed["thread_id"], "")
        self.assertEqual(parsed["subject"], "")
        self.assertEqual(parsed["snippet"], "")
        self.assertEqual(parsed["body"], "")


class GmailServiceTests(unittest.TestCase):
    def test_recent_messages_uses_bounded_inbox_query_and_fetches_full_messages(self):
        gmail = FakeGmailService(
            [{"id": "new"}, {"id": "older"}],
            {"new": {"id": "new"}, "older": {"id": "older"}},
        )

        messages = get_recent_messages(max_results=2, service=gmail)

        self.assertEqual(messages, [{"id": "new"}, {"id": "older"}])
        self.assertEqual(
            gmail.message_resource.list_arguments,
            {"userId": "me", "labelIds": ["INBOX"], "maxResults": 2},
        )
        self.assertEqual(
            gmail.message_resource.get_arguments,
            [
                {"userId": "me", "id": "new", "format": "full"},
                {"userId": "me", "id": "older", "format": "full"},
            ],
        )

    def test_recent_messages_rejects_limits_outside_safe_range(self):
        with self.assertRaises(ValueError):
            get_recent_messages(max_results=0, service=object())
        with self.assertRaises(ValueError):
            get_recent_messages(max_results=51, service=object())

    def test_latest_message_reports_an_empty_inbox(self):
        gmail = FakeGmailService([], {})

        with self.assertRaises(NoGmailMessagesError):
            get_latest_message(service=gmail)

    @patch("app.services.gmail_service.classify_email")
    def test_scan_message_combines_parsed_message_and_existing_classifier(self, classify):
        classify.return_value = {
            "classification": "Legitimate",
            "confidence": 97.42,
        }
        message = {
            "id": "message-1",
            "threadId": "thread-1",
            "payload": {
                "headers": [{"name": "Subject", "value": "Hello"}],
                "mimeType": "text/plain",
                "body": {"data": encode_body("Message body")},
            },
        }

        result = scan_message(message)

        classify.assert_called_once_with("Hello", "Message body")
        self.assertEqual(result["classification"], "Legitimate")
        self.assertEqual(result["confidence"], 97.42)

    @patch("app.services.gmail_service.classify_email")
    def test_scan_message_supports_empty_subject_or_body(self, classify):
        classify.return_value = {
            "classification": "Legitimate",
            "confidence": 80.0,
        }

        scan_message(
            {
                "payload": {
                    "headers": [],
                    "mimeType": "text/plain",
                    "body": {"data": encode_body("Body only")},
                }
            }
        )
        scan_message(
            {
                "payload": {
                    "headers": [{"name": "Subject", "value": "Subject only"}],
                    "mimeType": "text/plain",
                    "body": {},
                }
            }
        )

        self.assertEqual(
            classify.call_args_list,
            [
                unittest.mock.call("", "Body only"),
                unittest.mock.call("Subject only", ""),
            ],
        )


if __name__ == "__main__":
    unittest.main()
