"""Authenticate with Gmail, retrieve messages, and normalize their MIME bodies."""

from __future__ import annotations

import base64
import binascii
from email.header import decode_header, make_header
from email.utils import parseaddr
from html import unescape
from html.parser import HTMLParser
import re
from urllib.parse import urlsplit
from pathlib import Path
import threading
from typing import Any
from uuid import uuid4

from app.services.classifier_service import classify_email
from app.services.email_analysis_service import analyze_email


GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]
BACKEND_DIR = Path(__file__).resolve().parents[2]
CREDENTIALS_PATH = BACKEND_DIR / "credentials.json"
TOKEN_PATH = BACKEND_DIR / "token.json"
MAX_MESSAGES = 50
OAUTH_TIMEOUT_SECONDS = 300

_connection_lock = threading.Lock()
_connection_attempt_id: str | None = None
_connection_status: dict[str, Any] = {
    "state": "disconnected",
    "connected": False,
    "email": None,
    "error": None,
}


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


class GmailMessageNotFoundError(GmailServiceError):
    """Raised when Gmail has no message with the requested ID."""


def _gmail_imports() -> dict[str, Any]:
    """Load optional Google dependencies without exposing their internals."""
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

    return {
        "RefreshError": RefreshError,
        "Request": Request,
        "Credentials": Credentials,
        "InstalledAppFlow": InstalledAppFlow,
        "build": build,
    }


def _save_credentials(credentials: Any) -> None:
    """Replace the local token file without returning credential data."""
    temporary_path = TOKEN_PATH.with_name(f"{TOKEN_PATH.name}.tmp")
    temporary_path.write_text(credentials.to_json(), encoding="utf-8")
    temporary_path.replace(TOKEN_PATH)


def _load_existing_credentials() -> Any | None:
    """Load and refresh saved credentials without starting interactive OAuth."""
    if not TOKEN_PATH.is_file():
        return None

    google = _gmail_imports()
    refresh_error = google["RefreshError"]

    try:
        credentials = google["Credentials"].from_authorized_user_file(
            str(TOKEN_PATH), GMAIL_SCOPES
        )
        if credentials.expired and credentials.refresh_token:
            credentials.refresh(google["Request"]())
            _save_credentials(credentials)

        if not credentials.valid:
            raise GmailAuthenticationError(
                "Saved Gmail authorization is expired or invalid. Connect Gmail again."
            )
        return credentials
    except GmailAuthenticationError:
        raise
    except (OSError, ValueError, refresh_error) as exc:
        raise GmailAuthenticationError(
            "Saved Gmail authorization is expired or invalid. Connect Gmail again."
        ) from exc


def _build_gmail_service(credentials: Any) -> Any:
    try:
        return _gmail_imports()["build"](
            "gmail",
            "v1",
            credentials=credentials,
            cache_discovery=False,
        )
    except Exception as exc:
        raise GmailAuthenticationError(
            "Unable to create the authenticated Gmail service."
        ) from exc


def _get_account_email(service: Any) -> str | None:
    try:
        profile = service.users().getProfile(userId="me").execute()
        email = profile.get("emailAddress") if isinstance(profile, dict) else None
        return email if isinstance(email, str) and email else None
    except Exception as exc:
        raise GmailAPIError("Unable to verify the connected Gmail account.") from exc


def _status_payload() -> dict[str, Any]:
    return {
        **_connection_status,
        "credentials_configured": CREDENTIALS_PATH.is_file(),
    }


def get_gmail_connection_status() -> dict[str, Any]:
    """Report local Gmail authorization without initiating browser OAuth."""
    with _connection_lock:
        if _connection_status["state"] == "connecting":
            return _status_payload()

    try:
        credentials = _load_existing_credentials()
        if credentials is None:
            with _connection_lock:
                if _connection_status["state"] not in {"failed", "cancelled"}:
                    _connection_status.update(
                        state="disconnected", connected=False, email=None, error=None
                    )
                return _status_payload()

        service = _build_gmail_service(credentials)
        email = _get_account_email(service)
        with _connection_lock:
            _connection_status.update(
                state="connected", connected=True, email=email, error=None
            )
            return _status_payload()
    except GmailServiceError as exc:
        with _connection_lock:
            _connection_status.update(
                state="failed", connected=False, email=None, error=str(exc)
            )
            return _status_payload()


def _complete_oauth_connection(attempt_id: str) -> None:
    global _connection_attempt_id

    try:
        google = _gmail_imports()
        flow = google["InstalledAppFlow"].from_client_secrets_file(
            str(CREDENTIALS_PATH), GMAIL_SCOPES
        )
        credentials = flow.run_local_server(
            host="localhost",
            port=0,
            open_browser=True,
            timeout_seconds=OAUTH_TIMEOUT_SECONDS,
            success_message=(
                "PhishLab connected to Gmail. You may close this browser window."
            ),
        )
        if not credentials or not credentials.valid:
            raise GmailAuthenticationError(
                "Google did not return usable Gmail authorization."
            )

        with _connection_lock:
            if _connection_attempt_id != attempt_id:
                return

        email = _get_account_email(_build_gmail_service(credentials))
        with _connection_lock:
            if _connection_attempt_id != attempt_id:
                return
            _save_credentials(credentials)
            _connection_attempt_id = None
            _connection_status.update(
                state="connected", connected=True, email=email, error=None
            )
    except Exception as exc:
        with _connection_lock:
            if _connection_attempt_id != attempt_id:
                return
            _connection_attempt_id = None
            if isinstance(exc, GmailServiceError):
                message = str(exc)
            elif isinstance(exc, TimeoutError):
                message = "Gmail authorization timed out. Please try again."
            else:
                message = "Gmail authorization failed. Please try again."
            _connection_status.update(
                state="failed", connected=False, email=None, error=message
            )


def connect_gmail_account() -> dict[str, Any]:
    """Start a single bounded desktop OAuth attempt in a background thread."""
    global _connection_attempt_id

    if not CREDENTIALS_PATH.is_file():
        raise GmailConfigurationError("Gmail OAuth credentials are not configured.")

    current = get_gmail_connection_status()
    if current["connected"] or current["state"] == "connecting":
        return current

    attempt_id = uuid4().hex
    with _connection_lock:
        if _connection_status["state"] == "connecting":
            return _status_payload()
        _connection_attempt_id = attempt_id
        _connection_status.update(
            state="connecting", connected=False, email=None, error=None
        )
        status = _status_payload()

    threading.Thread(
        target=_complete_oauth_connection,
        args=(attempt_id,),
        daemon=True,
        name="gmail-oauth",
    ).start()
    return status


def disconnect_gmail_account() -> dict[str, Any]:
    """Remove local authorization; this does not revoke permission at Google."""
    global _connection_attempt_id

    with _connection_lock:
        was_connecting = _connection_status["state"] == "connecting"
        _connection_attempt_id = None
        for path in (TOKEN_PATH, TOKEN_PATH.with_name(f"{TOKEN_PATH.name}.tmp")):
            try:
                path.unlink(missing_ok=True)
            except OSError as exc:
                raise GmailAuthenticationError(
                    "Could not remove the local Gmail authorization."
                ) from exc
        _connection_status.update(
            state="cancelled" if was_connecting else "disconnected",
            connected=False,
            email=None,
            error=None,
        )
        return _status_payload()


# Ignore script markup, invisible preview padding, and other non-displayed HTML.
_HTML_IGNORED = {"head", "script", "style", "noscript", "svg", "template"}
_HTML_VOID = {
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
    "meta", "param", "source", "track", "wbr",
}


def _is_hidden_html_tag(tag: str, attrs: list[tuple[str, str | None]]) -> bool:
    values = dict(attrs)
    style = (values.get("style") or "").casefold().replace(" ", "")
    return (
        tag in _HTML_IGNORED
        or "hidden" in values
        or (values.get("aria-hidden") or "").casefold() == "true"
        or "display:none" in style
        or "visibility:hidden" in style
    )


def _close_ignored_html_tag(stack: list[str], tag: str) -> None:
    # A partial/malformed HTML document can close a parent before its children.
    if tag in stack:
        matching = len(stack) - 1 - stack[::-1].index(tag)
        del stack[matching:]


class _HTMLTextExtractor(HTMLParser):
    """Convert visible HTML email into text without rendering markup."""

    _BLOCKS = {
        "address", "article", "blockquote", "div", "dl", "dt", "dd", "h1", "h2",
        "h3", "h4", "h5", "h6", "header", "footer", "hr", "li", "main",
        "ol", "p", "pre", "section", "table", "td", "th", "tr", "ul",
    }

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._ignored_tags: list[str] = []
        self._chunks: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.casefold()
        if self._ignored_tags or _is_hidden_html_tag(tag, attrs):
            if tag not in _HTML_VOID:
                self._ignored_tags.append(tag)
            return
        if tag in self._BLOCKS or tag == "br":
            self._chunks.append("\n")

    def handle_endtag(self, tag: str) -> None:
        tag = tag.casefold()
        if self._ignored_tags:
            _close_ignored_html_tag(self._ignored_tags, tag)
            return
        if tag in self._BLOCKS:
            self._chunks.append("\n")

    def handle_data(self, data: str) -> None:
        if not self._ignored_tags:
            self._chunks.append(data)

    def text(self) -> str:
        return _clean_visible_text("".join(self._chunks))


class _HTMLLinkExtractor(HTMLParser):
    """Collect visible HTML anchor destinations and displayed labels."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.links: list[dict[str, str]] = []
        self._ignored_tags: list[str] = []
        self._href: str | None = None
        self._label: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.casefold()
        if self._ignored_tags or _is_hidden_html_tag(tag, attrs):
            if tag not in _HTML_VOID:
                self._ignored_tags.append(tag)
            return
        if tag == "a":
            href = dict(attrs).get("href")
            self._href = unescape(href.strip()) if isinstance(href, str) else None
            self._label = []

    def handle_data(self, data: str) -> None:
        if not self._ignored_tags and self._href is not None:
            self._label.append(data)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.casefold()
        if self._ignored_tags:
            _close_ignored_html_tag(self._ignored_tags, tag)
            return
        if tag != "a":
            return
        if self._href and _is_http_link(self._href):
            label = " ".join("".join(self._label).split()) or self._href
            self.links.append({"display_text": label, "url": self._href})
        self._href = None
        self._label = []


def _clean_visible_text(value: str) -> str:
    """Normalize entities and whitespace without hiding the original message content."""
    value = unescape(value).replace("\xa0", " ").replace("\r\n", "\n")
    value = value.replace("\u200b", "").replace("\u200c", "").replace("\ufeff", "")
    lines = [re.sub(r"[\t ]+", " ", line).strip() for line in value.splitlines()]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def _is_http_link(value: str) -> bool:
    try:
        parsed = urlsplit(value)
        return parsed.scheme.lower() in {"https", "http"} and bool(parsed.netloc)
    except ValueError:
        return False


def get_gmail_service() -> Any:
    """Return a Gmail service from saved credentials without interactive OAuth."""
    credentials = _load_existing_credentials()
    if credentials is None:
        raise GmailAuthenticationError(
            "Gmail is not connected. Connect an account from Settings."
        )
    return _build_gmail_service(credentials)


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


def get_message_by_id(message_id: str, service: Any | None = None) -> dict:
    """Retrieve one full Gmail message directly by its opaque message ID."""
    if not message_id or not message_id.strip():
        raise ValueError("message_id cannot be empty.")

    gmail = service or get_gmail_service()
    try:
        message = (
            gmail.users()
            .messages()
            .get(userId="me", id=message_id, format="full")
            .execute()
        )
        if not isinstance(message, dict) or not message.get("id"):
            raise GmailAPIError("Gmail returned a malformed message resource.")
        if str(message["id"]) != message_id:
            raise GmailAPIError("Gmail returned an unexpected message resource.")
        return message
    except GmailServiceError:
        raise
    except Exception as exc:
        status = getattr(getattr(exc, "resp", None), "status", None)
        if status == 404:
            raise GmailMessageNotFoundError(
                f"Gmail message '{message_id}' was not found."
            ) from exc
        raise GmailAPIError("Unable to retrieve the Gmail message.") from exc


def _decode_mime_header(value: str) -> str:
    """Decode common RFC 2047 encoded-name and subject headers."""
    try:
        return str(make_header(decode_header(value)))
    except (UnicodeError, ValueError, LookupError):
        return value


def get_header(headers: list[dict] | None, name: str) -> str:
    """Return a MIME header value using a case-insensitive name match."""
    for header in headers or []:
        if not isinstance(header, dict):
            continue
        if str(header.get("name", "")).casefold() == name.casefold():
            return _decode_mime_header(_string_or_empty(header.get("value")))
    return ""


def decode_body(encoded_data: str | None, charset: str = "utf-8") -> str:
    """Decode Gmail URL-safe base64, respecting the MIME text charset when known."""
    if not encoded_data or not isinstance(encoded_data, str):
        return ""
    try:
        padded_data = encoded_data + "=" * (-len(encoded_data) % 4)
        raw = base64.b64decode(
            padded_data.encode("ascii"), altchars=b"-_", validate=True
        )
        try:
            return raw.decode(charset or "utf-8", errors="replace")
        except LookupError:
            return raw.decode("utf-8", errors="replace")
    except (ValueError, TypeError, UnicodeEncodeError, binascii.Error):
        return ""


def _get_charset(part: dict) -> str:
    raw = get_header(part.get("headers"), "Content-Type")
    matched = re.search(r"charset\s*=\s*[\"']?([^\"';\s]+)", raw, flags=re.I)
    return matched.group(1) if matched else "utf-8"


def _is_attachment_part(part: dict) -> bool:
    if not isinstance(part, dict):
        return False
    if part.get("filename"):
        return True
    return get_header(part.get("headers"), "Content-Disposition").lower().startswith(
        "attachment"
    )


def _html_to_text(html_body: str) -> str:
    parser = _HTMLTextExtractor()
    try:
        parser.feed(html_body)
        parser.close()
        return parser.text()
    except (ValueError, TypeError):
        return ""


def _text_sections(part: dict) -> list[str]:
    """Read MIME branches once: choose the plain option in multipart/alternative."""
    if not isinstance(part, dict) or _is_attachment_part(part):
        return []
    mime = _string_or_empty(part.get("mimeType")).casefold()
    children = part.get("parts")
    if isinstance(children, list) and children:
        if mime == "multipart/alternative":
            candidates = [(child, _text_sections(child)) for child in children if isinstance(child, dict)]
            for child, sections in candidates:
                if _string_or_empty(child.get("mimeType")).casefold() == "text/plain" and sections:
                    return sections
            # A nested plain branch can also occur inside multipart/alternative.
            for child, sections in candidates:
                if _contains_plain_body(child) and sections:
                    return sections
            for _child, sections in candidates:
                if sections:
                    return sections
            return []
        sections = []
        for child in children:
            sections.extend(_text_sections(child))
        return sections

    body = part.get("body")
    if not isinstance(body, dict):
        return []
    decoded = decode_body(body.get("data"), _get_charset(part))
    if mime == "text/plain":
        cleaned = _clean_visible_text(decoded)
    elif mime == "text/html":
        cleaned = _html_to_text(decoded)
    else:
        return []
    return [cleaned] if cleaned else []


def _contains_plain_body(part: dict) -> bool:
    if not isinstance(part, dict) or _is_attachment_part(part):
        return False
    if _string_or_empty(part.get("mimeType")).casefold() == "text/plain":
        return True
    return any(_contains_plain_body(child) for child in part.get("parts") or [] if isinstance(child, dict))


def extract_body(payload: dict | None) -> str:
    """Read visible MIME text without duplicating HTML/plain alternative copies."""
    if not isinstance(payload, dict):
        return ""
    return "\n\n".join(_text_sections(payload))


_URL_PATTERN = re.compile(r"https?://[^\s<>\"']+", re.I)
_ACTION_PATTERN = re.compile(
    r"\b(?:please|verify|confirm|update|review|click|open|visit|reset|"
    r"download|reply|send|submit|pay|sign\s+in|log\s+in|follow|"
    r"complete|check|contact|register|unsubscribe)\b",
    re.I,
)
_GREETING_PATTERN = re.compile(
    r"^(?:dear|hello|hi|hey|good morning|good afternoon|good evening)"
    r"(?:[ \t]+[^\n\r,!:]{1,85})?[,!:]",
    re.I,
)
_SIGNOFF_PATTERN = re.compile(
    r"^(?:best(?: regards| wishes)?|kind regards|warm regards|regards|"
    r"sincerely|thanks|thank you|cheers)[,!]?$",
    re.I,
)


def _iter_message_parts(part: dict) -> list[dict]:
    if not isinstance(part, dict):
        return []
    result = [part]
    if _is_attachment_part(part):
        return result
    for child in part.get("parts") or []:
        if isinstance(child, dict):
            result.extend(_iter_message_parts(child))
    return result


def _extract_links(payload: dict, body: str) -> list[dict[str, str]]:
    links: list[dict[str, str]] = []
    seen: set[str] = set()

    def add(url: str, label: str) -> None:
        if url not in seen and _is_http_link(url) and len(links) < 40:
            seen.add(url)
            links.append({"display_text": label.strip() or url, "url": url})

    # Extract actual anchor targets, even if a text/plain alternative was chosen.
    for part in _iter_message_parts(payload):
        if _is_attachment_part(part) or _string_or_empty(part.get("mimeType")).casefold() != "text/html":
            continue
        html = decode_body((part.get("body") or {}).get("data"), _get_charset(part))
        if not html:
            continue
        extractor = _HTMLLinkExtractor()
        try:
            extractor.feed(html)
            extractor.close()
        except (TypeError, ValueError):
            continue
        for link in extractor.links:
            add(link["url"], link["display_text"])

    for match in _URL_PATTERN.finditer(body):
        url = match.group().rstrip(".,;:!?)]}")
        add(url, url)
    return links


def _extract_attachments(payload: dict) -> list[dict[str, str | int]]:
    """Return attachment metadata only. Do not download or open files."""
    attachments: list[dict[str, str | int]] = []
    for part in _iter_message_parts(payload):
        name = _string_or_empty(part.get("filename")).strip()
        disposition = get_header(part.get("headers"), "Content-Disposition").casefold()
        # Decorative inline CID images do not normally appear as user attachments.
        if not name or disposition.startswith("inline"):
            continue
        body = part.get("body") if isinstance(part.get("body"), dict) else {}
        size = body.get("size")
        attachments.append({
            "filename": name,
            "mime_type": _string_or_empty(part.get("mimeType")) or "application/octet-stream",
            "size": size if isinstance(size, int) and size >= 0 else 0,
        })
    return attachments[:40]


def _extract_greeting(body: str) -> str:
    first = next((line.strip() for line in body.splitlines() if line.strip()), "")
    match = _GREETING_PATTERN.match(first)
    return match.group(0) if match else ""


def _extract_requested_action(body: str) -> str:
    """Best-effort literal sentence extraction, not a security classification."""
    # Only extract the actual text found in the email; never create an action.
    for line in body.splitlines():
        line = line.strip()
        if not line or len(line) > 1000:
            continue
        for sentence in re.split(r"(?<=[.!?])\s+", line):
            sentence = sentence.strip()
            if 8 <= len(sentence) <= 320 and _ACTION_PATTERN.search(sentence):
                return sentence
    return ""


def _extract_signature(body: str) -> str:
    """Find a conventional short closing sign-off near the end of the email."""
    lines = [line.strip() for line in body.splitlines() if line.strip()]
    for index in range(len(lines) - 1, max(-1, len(lines) - 7), -1):
        if _SIGNOFF_PATTERN.fullmatch(lines[index]):
            following = lines[index + 1:index + 3]
            if following and sum(map(len, following)) <= 140:
                return "\n".join(following)
    return ""


def parse_message(message: dict | None) -> dict:
    """Normalize a Gmail full message and return optional structured components."""
    if not isinstance(message, dict):
        message = {}
    payload = message.get("payload")
    if not isinstance(payload, dict):
        payload = {}
    headers = payload.get("headers")
    if not isinstance(headers, list):
        headers = []

    sender = get_header(headers, "From")
    sender_name, sender_address = parseaddr(sender)
    body = extract_body(payload)
    links = _extract_links(payload, body)
    attachments = _extract_attachments(payload)
    return {
        "id": _string_or_empty(message.get("id")),
        "thread_id": _string_or_empty(message.get("threadId")),
        "sender": sender,
        "sender_name": sender_name or sender_address,
        "sender_address": sender_address,
        "reply_to": get_header(headers, "Reply-To"),
        "recipient": get_header(headers, "To"),
        "subject": get_header(headers, "Subject"),
        "date": get_header(headers, "Date"),
        "snippet": _clean_visible_text(_string_or_empty(message.get("snippet"))),
        "body": body,
        "greeting": _extract_greeting(body),
        "request": _extract_requested_action(body),
        "links": links,
        "link_text": next((link["display_text"] for link in links if link["display_text"]), ""),
        "attachments": attachments,
        "attachment": attachments[0]["filename"] if attachments else "",
        "signature": _extract_signature(body),
    }


def scan_message(message: dict) -> dict:
    """Parse one Gmail message and classify it with the existing model service."""
    parsed = parse_message(message)
    classification = classify_email(parsed["subject"], parsed["body"])
    return {**parsed, **classification, "security_analysis": analyze_email(parsed)}


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
