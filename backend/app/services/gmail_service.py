"""Authenticate with Gmail, retrieve messages, and normalize their MIME bodies."""

from __future__ import annotations

import base64
import binascii
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

from app.services.classifier_service import classify_email


GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]
BACKEND_DIR = Path(__file__).resolve().parents[2]
CREDENTIALS_PATH = BACKEND_DIR / "credentials.json"
TOKEN_PATH = BACKEND_DIR / "token.json"
MAX_MESSAGES = 50


def _string_or_empty(value: Any) -> str:
    """Normalize absent Gmail fields without returning the string ``"None"``."""
    return "" if value is None else str(value)


class GmailServiceError(Exception):
    """Base exception for safe, expected Gmail integration failures."""


class GmailConfigurationError(GmailServiceError):
    """Raised when Gmail dependencies or local OAuth configuration are missing."""


class GmailAuthenticationError(GmailServiceError):
    """Raised when Gmail OAuth authentication cannot be completed."""


class GmailAPIError(GmailServiceError):
    """Raised when a Gmail API request fails."""


class NoGmailMessagesError(GmailServiceError):
    """Raised when the authenticated account's inbox has no messages."""


class _HTMLTextExtractor(HTMLParser):
    """Extract visible text for messages that only contain an HTML body."""

    def __init__(self) -> None:
        super().__init__()
        self._ignored_depth = 0
        self._chunks: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.casefold() in {"script", "style"}:
            self._ignored_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag.casefold() in {"script", "style"} and self._ignored_depth:
            self._ignored_depth -= 1

    def handle_data(self, data: str) -> None:
        if not self._ignored_depth:
            self._chunks.append(data)

    def text(self) -> str:
        return " ".join(" ".join(self._chunks).split())


def get_gmail_service() -> Any:
    """Return an authenticated Gmail v1 service using local desktop OAuth."""
    try:
        from google.auth.exceptions import RefreshError
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
        from googleapiclient.discovery import build
    except ImportError as exc:
        raise GmailConfigurationError(
            "Gmail API dependencies are not installed."
        ) from exc

    credentials = None

    try:
        if TOKEN_PATH.exists():
            try:
                credentials = Credentials.from_authorized_user_file(
                    str(TOKEN_PATH), GMAIL_SCOPES
                )
            except ValueError:
                # A malformed or obsolete local token can be replaced by OAuth.
                credentials = None

        if not credentials or not credentials.valid:
            if credentials and credentials.expired and credentials.refresh_token:
                try:
                    credentials.refresh(Request())
                except RefreshError:
                    # Revoked/invalid refresh tokens require fresh user consent.
                    credentials = None

            if not credentials or not credentials.valid:
                if not CREDENTIALS_PATH.is_file():
                    raise GmailConfigurationError(
                        "Gmail OAuth credentials are not configured."
                    )
                flow = InstalledAppFlow.from_client_secrets_file(
                    str(CREDENTIALS_PATH), GMAIL_SCOPES
                )
                credentials = flow.run_local_server(port=0)

            TOKEN_PATH.write_text(credentials.to_json(), encoding="utf-8")

        return build(
            "gmail",
            "v1",
            credentials=credentials,
            cache_discovery=False,
        )
    except GmailConfigurationError:
        raise
    except (OSError, ValueError, RefreshError) as exc:
        raise GmailAuthenticationError(
            "Gmail authentication failed. Reauthorize the application."
        ) from exc
    except Exception as exc:
        raise GmailAuthenticationError(
            "Unable to create the authenticated Gmail service."
        ) from exc


def get_recent_messages(max_results: int = 10, service: Any | None = None) -> list[dict]:
    """Retrieve at most ``max_results`` newest messages from the Gmail inbox."""
    if not 1 <= max_results <= MAX_MESSAGES:
        raise ValueError(f"max_results must be between 1 and {MAX_MESSAGES}.")

    gmail = service or get_gmail_service()
    try:
        response = (
            gmail.users()
            .messages()
            .list(
                userId="me",
                labelIds=["INBOX"],
                maxResults=max_results,
            )
            .execute()
        )
        message_refs = response.get("messages", [])

        return [
            gmail.users()
            .messages()
            .get(userId="me", id=message_ref["id"], format="full")
            .execute()
            for message_ref in message_refs
            if isinstance(message_ref, dict) and message_ref.get("id")
        ]
    except Exception as exc:
        raise GmailAPIError("Unable to retrieve messages from Gmail.") from exc


def get_latest_message(service: Any | None = None) -> dict:
    """Retrieve the newest message from the Gmail inbox."""
    messages = get_recent_messages(max_results=1, service=service)
    if not messages:
        raise NoGmailMessagesError("The Gmail inbox contains no messages.")
    return messages[0]


def get_header(headers: list[dict] | None, name: str) -> str:
    """Return a MIME header value using a case-insensitive name match."""
    for header in headers or []:
        if not isinstance(header, dict):
            continue
        if str(header.get("name", "")).casefold() == name.casefold():
            return _string_or_empty(header.get("value"))
    return ""


def decode_body(encoded_data: str | None) -> str:
    """Decode Gmail's URL-safe base64 body data without raising on bad input."""
    if not encoded_data:
        return ""

    try:
        padded_data = encoded_data + "=" * (-len(encoded_data) % 4)
        decoded = base64.b64decode(
            padded_data.encode("ascii"), altchars=b"-_", validate=True
        )
        return decoded.decode("utf-8", errors="replace")
    except (ValueError, TypeError, UnicodeEncodeError, binascii.Error):
        return ""


def _html_to_text(html_body: str) -> str:
    parser = _HTMLTextExtractor()
    try:
        parser.feed(html_body)
        parser.close()
        return unescape(parser.text())
    except (ValueError, TypeError):
        return ""


def _collect_body_parts(part: dict, plain_parts: list[str], html_parts: list[str]) -> None:
    if not isinstance(part, dict):
        return

    # Skip the entire subtree of a named attachment, including attached emails.
    if part.get("filename"):
        return

    for child in part.get("parts") or []:
        _collect_body_parts(child, plain_parts, html_parts)

    mime_type = str(part.get("mimeType", "")).casefold()
    body = part.get("body") or {}
    if not isinstance(body, dict):
        return
    decoded = decode_body(body.get("data"))
    if not decoded.strip():
        return

    if mime_type == "text/plain":
        plain_parts.append(decoded.strip())
    elif mime_type == "text/html":
        html_parts.append(decoded)


def extract_body(payload: dict | None) -> str:
    """Recursively extract text, preferring plain text over an HTML fallback."""
    if not payload:
        return ""

    plain_parts: list[str] = []
    html_parts: list[str] = []
    _collect_body_parts(payload, plain_parts, html_parts)

    if plain_parts:
        return "\n\n".join(plain_parts)
    if html_parts:
        return "\n\n".join(filter(None, (_html_to_text(part) for part in html_parts)))
    return ""


def parse_message(message: dict | None) -> dict:
    """Normalize a full Gmail API message resource into application fields."""
    if not isinstance(message, dict):
        message = {}
    payload = message.get("payload") or {}
    if not isinstance(payload, dict):
        payload = {}
    headers = payload.get("headers") or []
    if not isinstance(headers, list):
        headers = []

    return {
        "id": _string_or_empty(message.get("id")),
        "thread_id": _string_or_empty(message.get("threadId")),
        "sender": get_header(headers, "From"),
        "recipient": get_header(headers, "To"),
        "subject": get_header(headers, "Subject"),
        "date": get_header(headers, "Date"),
        "snippet": _string_or_empty(message.get("snippet")),
        "body": extract_body(payload),
    }


def scan_message(message: dict) -> dict:
    """Parse one Gmail message and classify it with the existing model service."""
    parsed = parse_message(message)
    classification = classify_email(parsed["subject"], parsed["body"])
    return {**parsed, **classification}


def scan_latest_message(service: Any | None = None) -> dict:
    """Retrieve, normalize, and classify the newest inbox message."""
    return scan_message(get_latest_message(service=service))


def scan_recent_messages(
    max_results: int = 10, service: Any | None = None
) -> list[dict]:
    """Retrieve, normalize, and classify recent inbox messages."""
    return [
        scan_message(message)
        for message in get_recent_messages(max_results=max_results, service=service)
    ]
