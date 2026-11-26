"""Authenticate with Gmail, retrieve messages, and normalize their MIME bodies."""

from __future__ import annotations

import base64
import binascii
import json
from email.header import decode_header, make_header
from email.utils import parseaddr
from html import unescape
from html.parser import HTMLParser
import re
import os
import tempfile
from urllib.parse import urlsplit
from pathlib import Path
import threading
from typing import Any
from uuid import uuid4

from app.services.classifier_service import classify_email
from app.services.email_analysis_service import analyze_email


GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly", "openid", "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"]
BACKEND_DIR = Path(__file__).resolve().parents[2]
CREDENTIALS_PATH = Path(os.getenv("PHISHLAB_GMAIL_CREDENTIALS_PATH", str(BACKEND_DIR / "credentials.json"))).expanduser()
TOKEN_PATH = Path(os.getenv("PHISHLAB_GMAIL_TOKEN_PATH", str(BACKEND_DIR / "token.json"))).expanduser()
MAX_MESSAGES = 50
OAUTH_TIMEOUT_SECONDS = 300

_connection_lock = threading.Lock()
_credentials_lock = threading.RLock()
_connection_attempt_id: str | None = None
_connection_status: dict[str, Any] = {
    "state": "disconnected",
    "connected": False,
    "email": None,
    "display_name": None,
    "avatar_available": False,
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
        from google.auth.exceptions import RefreshError, TransportError
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
        from googleapiclient.discovery import build
    except ImportError as exc:
        raise GmailConfigurationError(
            "Google sign-in support is missing from this installation (google-auth-oauthlib or Google API libraries). Rebuild PhishLab with backend requirements installed."
        ) from exc

    return {
        "RefreshError": RefreshError,
        "TransportError": TransportError,
        "Request": Request,
        "Credentials": Credentials,
        "InstalledAppFlow": InstalledAppFlow,
        "build": build,
    }


def configure_gmail_oauth_client(configuration: Any) -> dict[str, Any]:
    """Import a Google *Desktop application* OAuth client, never a user token.

    Only a trusted local caller can access the API route. The server validates the
    client metadata and writes an owner-only file atomically, without logging IDs,
    secrets or the document. A token is never accepted as an OAuth client.
    """
    if not isinstance(configuration, dict) or set(configuration) != {"installed"}:
        raise GmailConfigurationError(
            "Select the Desktop application OAuth client JSON downloaded from Google Cloud."
        )
    installed = configuration.get("installed")
    if not isinstance(installed, dict):
        raise GmailConfigurationError("Invalid Desktop OAuth client JSON.")
    for name in ("client_id", "client_secret", "auth_uri", "token_uri"):
        value = installed.get(name)
        if not isinstance(value, str) or not value or len(value) > 2048:
            raise GmailConfigurationError(f"Invalid Desktop OAuth client: missing {name}.")
    if not installed["client_id"].endswith(".apps.googleusercontent.com"):
        raise GmailConfigurationError("This file is not a Google OAuth Desktop client.")
    if (urlsplit(installed["auth_uri"]).scheme != "https" or
        urlsplit(installed["auth_uri"]).hostname != "accounts.google.com" or
        installed["token_uri"] != "https://oauth2.googleapis.com/token"):
        raise GmailConfigurationError("Unexpected Google OAuth authorization endpoints.")
    if TOKEN_PATH.exists():
        raise GmailConfigurationError("Disconnect Gmail before changing its OAuth client.")
    with _connection_lock:
        if _connection_status["state"] == "connecting":
            raise GmailConfigurationError("Wait for Gmail authorization to finish before changing its OAuth client.")
    with _credentials_lock:
        temporary_path = None
        try:
            CREDENTIALS_PATH.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            descriptor, temporary_name = tempfile.mkstemp(
                prefix=f".{CREDENTIALS_PATH.name}.", suffix=".tmp", dir=CREDENTIALS_PATH.parent
            )
            temporary_path = Path(temporary_name)
            with os.fdopen(descriptor, "w", encoding="utf-8") as output:
                json.dump(configuration, output, ensure_ascii=True)
                output.flush()
                os.fsync(output.fileno())
            temporary_path.replace(CREDENTIALS_PATH)
            if os.name == "posix":
                CREDENTIALS_PATH.chmod(0o600)
        except OSError as exc:
            raise GmailConfigurationError(
                "Cannot save Google OAuth configuration in the application-data folder."
            ) from exc
        finally:
            if temporary_path is not None:
                temporary_path.unlink(missing_ok=True)
    return get_gmail_connection_status()


def _save_credentials(credentials: Any) -> None:
    """Write OAuth tokens atomically, with owner-only permissions when supported."""
    with _credentials_lock:
        temporary_path = None
        try:
            descriptor, temporary_name = tempfile.mkstemp(
                prefix=f".{TOKEN_PATH.name}.", suffix=".tmp", dir=TOKEN_PATH.parent
            )
            temporary_path = Path(temporary_name)
            with os.fdopen(descriptor, "w", encoding="utf-8") as file:
                file.write(credentials.to_json())
                file.flush()
                os.fsync(file.fileno())
            temporary_path.replace(TOKEN_PATH)
            # mkstemp gives 0600 on POSIX; reinforce it if an older token was replaced.
            if os.name == "posix":
                TOKEN_PATH.chmod(0o600)
        except OSError as exc:
            raise GmailAuthenticationError("Could not save local Gmail authorization.") from exc
        finally:
            if temporary_path is not None:
                temporary_path.unlink(missing_ok=True)


def _load_existing_credentials() -> Any | None:
    """Read saved authorization and distinguish an expired token from an outage."""
    with _credentials_lock:
        if not TOKEN_PATH.is_file():
            return None

        google = _gmail_imports()
        refresh_error = google["RefreshError"]
        transport_error = google.get("TransportError", ConnectionError)
        try:
            if os.name == "posix":
                TOKEN_PATH.chmod(0o600)
            credentials = google["Credentials"].from_authorized_user_file(
                str(TOKEN_PATH), GMAIL_SCOPES
            )
        except (OSError, ValueError, TypeError, KeyError) as exc:
            raise GmailAuthenticationError(
                "Saved Gmail authorization is invalid. Connect Gmail again."
            ) from exc

        if credentials.expired and credentials.refresh_token:
            try:
                credentials.refresh(google["Request"]())
                _save_credentials(credentials)
            except refresh_error as exc:
                raise GmailAuthenticationError(
                    "Saved Gmail authorization has expired. Connect Gmail again."
                ) from exc
            except (transport_error, TimeoutError) as exc:
                raise GmailAPIError(
                    "Gmail authentication service could not be reached. Please retry."
                ) from exc
        if not credentials.valid:
            raise GmailAuthenticationError(
                "Saved Gmail authorization is expired or invalid. Connect Gmail again."
            )
        return credentials


def _gmail_api_failure(exc: Exception, message: str) -> GmailServiceError:
    """Separate expired/denied credentials from transient remote API errors."""
    response = getattr(exc, "resp", None)
    status = getattr(response, "status", None)
    if status in (401, 403):
        return GmailAuthenticationError(
            "Gmail authorization was rejected. Reconnect the account from Settings."
        )
    return GmailAPIError(message)


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
        raise _gmail_api_failure(exc, "Unable to verify the connected Gmail account.") from exc


# Profile pictures are fetched through the local API so the Electron renderer
# never needs permission to contact arbitrary external image hosts.
_profile_lock = threading.Lock()
_profile_cache: dict[str, Any] = {"email": None, "name": None, "picture": None, "at": 0.0}


def _google_identity(credentials: Any, email: str | None) -> tuple[str | None, bool]:
    """Best-effort OpenID identity. Old Gmail-only tokens fall back to email.

    Only the fixed Google UserInfo endpoint is contacted. No token, photo URL
    or other Google profile attributes are persisted to disk.
    """
    from time import monotonic
    fallback = email.split("@", 1)[0] if email else None
    if not email or not getattr(credentials, "token", None):
        return fallback, False
    with _profile_lock:
        if _profile_cache["email"] == email and monotonic() - _profile_cache["at"] < 300:
            return _profile_cache["name"] or fallback, bool(_profile_cache["picture"])
    name, picture = fallback, None
    try:
        from google.auth.transport.requests import AuthorizedSession
        response = AuthorizedSession(credentials).get(
            "https://openidconnect.googleapis.com/v1/userinfo", timeout=4
        )
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, dict) and data.get("email") == email:
                name_candidate = data.get("name")
                if isinstance(name_candidate, str) and 0 < len(name_candidate.strip()) <= 120:
                    name = name_candidate.strip()
                photo = data.get("picture")
                if isinstance(photo, str) and _approved_avatar_url(photo):
                    picture = photo
    except Exception:
        # An old Gmail-only grant or temporary connectivity failure must not
        # break scanning; reconnecting grants the new optional profile scopes.
        pass
    with _profile_lock:
        _profile_cache.update(email=email, name=name, picture=picture, at=monotonic())
    return name, bool(picture)


def _approved_avatar_url(url: str) -> bool:
    try:
        parsed = urlsplit(url)
        host = (parsed.hostname or "").lower()
        return (parsed.scheme == "https" and parsed.username is None and
                parsed.password is None and parsed.port in (None, 443) and
                (host == "googleusercontent.com" or host.endswith(".googleusercontent.com")))
    except ValueError:
        return False


def get_google_avatar() -> tuple[bytes, str] | None:
    """Fetch only a trusted Google-hosted image with a strict byte limit."""
    with _profile_lock:
        url = _profile_cache.get("picture")
    if not isinstance(url, str) or not _approved_avatar_url(url):
        return None
    try:
        import requests
        with requests.get(url, timeout=5, stream=True, allow_redirects=False) as response:
            if response.status_code != 200 or response.headers.get("content-type", "").split(";")[0] not in ("image/png", "image/jpeg", "image/webp"):
                return None
            chunks, total = [], 0
            for chunk in response.iter_content(chunk_size=16384):
                total += len(chunk)
                if total > 512_000:
                    return None
                chunks.append(chunk)
            return b"".join(chunks), response.headers["content-type"].split(";")[0]
    except Exception:
        return None


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
                        state="disconnected", connected=False, email=None, display_name=None, avatar_available=False, error=None
                    )
                return _status_payload()

        service = _build_gmail_service(credentials)
        email = _get_account_email(service)
        display_name, avatar_available = _google_identity(credentials, email)
        with _connection_lock:
            _connection_status.update(
                state="connected", connected=True, email=email,
                display_name=display_name, avatar_available=avatar_available, error=None
            )
            return _status_payload()
    except GmailServiceError as exc:
        with _connection_lock:
            _connection_status.update(
                state="failed", connected=False, email=None, display_name=None, avatar_available=False, error=str(exc)
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
        display_name, avatar_available = _google_identity(credentials, email)
        with _connection_lock:
            if _connection_attempt_id != attempt_id:
                return
            _save_credentials(credentials)
            _connection_attempt_id = None
            _connection_status.update(
                state="connected", connected=True, email=email,
                display_name=display_name, avatar_available=avatar_available, error=None
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
                state="failed", connected=False, email=None, display_name=None, avatar_available=False, error=message
            )


def connect_gmail_account() -> dict[str, Any]:
    """Start a single bounded desktop OAuth attempt in a background thread."""
    global _connection_attempt_id

    if not CREDENTIALS_PATH.is_file():
        raise GmailConfigurationError("Google OAuth Desktop credentials are not configured. Import your OAuth client JSON in Settings → Gmail.")

    current = get_gmail_connection_status()
    if current["connected"] or current["state"] == "connecting":
        return current

    attempt_id = uuid4().hex
    with _connection_lock:
        if _connection_status["state"] == "connecting":
            return _status_payload()
        _connection_attempt_id = attempt_id
        _connection_status.update(
            state="connecting", connected=False, email=None, display_name=None, avatar_available=False, error=None
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

    with _profile_lock:
        _profile_cache.update(email=None, name=None, picture=None, at=0.0)
    with _connection_lock:
        was_connecting = _connection_status["state"] == "connecting"
        _connection_attempt_id = None
        with _credentials_lock:
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
            display_name=None,
            avatar_available=False,
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


_INVISIBLE_CHARS = re.compile("[\u200b\u200c\u2060\ufeff\u00ad\u034f\u180e\u2800\u3164\u115f\u1160\uffa0]")
# Exotic spaces (figure space, narrow no-break space, ideographic space ...) used as padding.
_UNICODE_SPACES = re.compile("[\u1680\u2000-\u200a\u202f\u205f\u3000]")
# text/plain parts from marketing senders often contain Markdown-style links,
# "[label](https://tracking-url)". Readers (and the classifier) should see the label.
_MARKDOWN_LINK = re.compile(r"\[((?:[^\[\]\n]|\[[^\[\]\n]*\]){1,300})\]\((https?://[^)\s]+)\)", re.I)


_HTML_IN_PLAIN = re.compile(
    r"</?(?:a|span|strong|b|i|u|em|br|div|p|table|tr|td|th|img|font|center|h[1-6]|ul|ol|li)\b[^>]*>", re.I)
_WRAPPED_URL = re.compile(r"[<\[](https?://[^\s<>\[\]]+)[>\]]", re.I)
_LONG_URL = re.compile(r"https?://[^\s<>\"']{81,}", re.I)
_MAX_INLINE_URL = 80
_HTML_COMMENT = re.compile(r"<!--.*?-->", re.S)
_CONDITIONAL_MARKER = re.compile(r"<!\[(?:if|endif)[^>]*>", re.I)
# Leftovers of broken tags, e.g.  data-block="row_1_image">
_ATTRIBUTE_RESIDUE = re.compile(r'\b[\w:-]+="[^"\n]{0,200}">?')
_EMPTY_BRACKETS = re.compile(r"\[\s*\]")
_SPACED_PAREN_URL = re.compile(r"\(\s+(https?://\S+?)\s+\)")


def _shorten_url(match: re.Match) -> str:
    """Tracking links can be 300+ characters; show scheme://host/ and an ellipsis."""
    url = match.group()
    try:
        parts = urlsplit(url)
        return f"{parts.scheme}://{parts.netloc}/\u2026" if parts.netloc else url[:_MAX_INLINE_URL] + "\u2026"
    except ValueError:
        return url[:_MAX_INLINE_URL] + "\u2026"


def _tidy_plain_text(decoded: str) -> str:
    """Make a text/plain part readable without losing its meaning.

    Link destinations are collected separately from the raw text, so the body
    can hide tracking noise: Markdown links collapse to their labels, <url> and
    [url] wrappers are removed, long URLs are abbreviated, and plain-text parts
    that actually contain HTML markup are converted like HTML.
    """
    # HTML comments / Outlook conditional blocks (<!--[if mso]> ... <![endif]-->)
    decoded = _HTML_COMMENT.sub("", decoded)
    decoded = _CONDITIONAL_MARKER.sub("", decoded)
    if len(_HTML_IN_PLAIN.findall(decoded)) >= 2:
        decoded = _html_to_text(decoded) or decoded
    decoded = _MARKDOWN_LINK.sub(r"\1", decoded)
    decoded = _WRAPPED_URL.sub(r"\1", decoded)
    decoded = _LONG_URL.sub(_shorten_url, decoded)
    decoded = _ATTRIBUTE_RESIDUE.sub("", decoded)
    decoded = _EMPTY_BRACKETS.sub("", decoded)
    return _SPACED_PAREN_URL.sub(r"(\1)", decoded)


def _clean_visible_text(value: str) -> str:
    """Normalize entities and whitespace without hiding the original message content."""
    value = unescape(value).replace("\xa0", " ").replace("\r\n", "\n")
    # Zero-width / invisible padding used for email preheaders (ZWSP, ZWNJ,
    # word joiner, BOM, soft hyphen, combining grapheme joiner, Mongolian vowel sep.).
    value = _UNICODE_SPACES.sub(" ", _INVISIBLE_CHARS.sub("", value))
    lines = [re.sub(r"[\t ]+", " ", line).strip() for line in value.splitlines()]
    # Spacer cells in HTML emails often leave lines holding only "." or "|" etc.
    lines = [line for line in lines if not (line and len(line) <= 3 and not any(c.isalnum() for c in line))]
    text = re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()
    # Product grids / buttons produce one short fragment per paragraph; keep
    # paragraph breaks only around longer prose.
    blocks = text.split("\n\n")
    merged = [blocks[0]] if blocks and blocks[0] else []
    for block in blocks[1:]:
        if merged and max(len(merged[-1].rsplit("\n", 1)[-1]), len(block.split("\n", 1)[0])) <= 60:
            merged[-1] += "\n" + block
        else:
            merged.append(block)
    return "\n\n".join(merged)


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
        raise _gmail_api_failure(exc, "Unable to retrieve messages from Gmail.") from exc


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
        raise _gmail_api_failure(exc, "Unable to retrieve the Gmail message.") from exc


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
        cleaned = _clean_visible_text(_tidy_plain_text(decoded))
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

    # Plain-text parts: the body shown to the classifier has Markdown link URLs
    # collapsed to their labels, so read the destinations from the raw text.
    for part in _iter_message_parts(payload):
        if _is_attachment_part(part) or _string_or_empty(part.get("mimeType")).casefold() != "text/plain":
            continue
        raw = decode_body((part.get("body") or {}).get("data"), _get_charset(part))
        for match in _MARKDOWN_LINK.finditer(raw):
            add(match.group(2), match.group(1))
        for match in _URL_PATTERN.finditer(_MARKDOWN_LINK.sub(" ", raw)):
            url = match.group().rstrip(".,;:!?)]}>")
            add(url, url)

    for match in _URL_PATTERN.finditer(body):
        url = match.group().rstrip(".,;:!?)]}")
        if url.endswith("\u2026"):  # abbreviated tracking URL; full one was read above
            continue
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
