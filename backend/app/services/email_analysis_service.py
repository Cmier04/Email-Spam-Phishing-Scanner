"""Conservative, rule-based email evidence detection (not an ML explanation).

This module does not visit links, download attachments, or change model scores.
Rules identify literal observations worth reviewing; legitimate emails can
contain these indicators and phishing emails can contain none of them.
"""

from __future__ import annotations

from email.utils import parseaddr
import ipaddress
import re
from typing import Any, Mapping
from urllib.parse import urlsplit


MAX_ANALYSIS_CHARS = 80_000
MAX_INDICATORS = 7
MAX_EVIDENCE_CHARS = 150

# Keep patterns bounded and focused on explicitly observable text.
_URGENCY = re.compile(
    r"\b(?:urgent(?:ly)?|immediately|act now|final notice|"
    r"within\s+(?:the\s+next\s+)?\d{1,3}\s+(?:hours?|days?)|"
    r"(?:account|access)\s+(?:will\s+be\s+)?(?:suspended|terminated)|"
    r"(?:expires?|expiring)\s+(?:today|tonight)|by\s+end\s+of\s+day)\b",
    re.IGNORECASE,
)
_SENSITIVE_REQUEST = re.compile(
    r"\b(?:provide|enter|send|share|submit|reply\s+with|confirm|verify|"
    r"upload|update)\s+(?:(?:your|the|a|an|my|our|account)\s+|"
    r"(?:personal|banking|login|security|payment)\s+){0,3}"
    r"(?:password|passcode|one[\s-]?time\s+(?:code|password)|otp|"
    r"security\s+code|social\s+security\s+number|ssn|"
    r"credit\s+card\s+(?:number|details)|bank\s+account\s+(?:number|details))\b",
    re.IGNORECASE,
)
_PAYMENT_REQUEST = re.compile(
    r"\b(?:wire|transfer|send|pay|purchase|buy|provide|update)\s+"
    r"(?:(?:the|your|a|an|my|our)\s+){0,2}"
    r"(?:gift\s+cards?|crypto(?:currency)?|bitcoin|wire\s+transfer|"
    r"bank\s+(?:account|details)|payment\s+(?:details|information)|"
    r"invoice|outstanding\s+balance)\b",
    re.IGNORECASE,
)
_NEGATED_REQUEST = re.compile(
    r"\b(?:never|do\s+not|don't|avoid|should\s+not|shouldn't|"
    r"won't|would\s+not|wouldn't)\s+(?:ever\s+)?$",
    re.IGNORECASE,
)
_HOST_LABEL = re.compile(
    r"^(?:https?://)?((?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,63})"
    r"(?::\d{1,5})?(?:[/#?]\S*)?$",
    re.IGNORECASE,
)
_DANGEROUS_SUFFIXES = frozenset({
    ".exe", ".scr", ".js", ".jse", ".vbs", ".vbe", ".wsf",
    ".wsh", ".bat", ".cmd", ".com", ".ps1", ".hta", ".msi",
    ".lnk", ".jar", ".app", ".dmg", ".iso", ".sh",
})
_ANALYSIS_NOTE = (
    "These are rule-based observations, not proof of phishing and not an "
    "explanation of the classifier's internal decision. No detected "
    "indicators does not guarantee an email is safe."
)


def _text(value: Any) -> str:
    return value if isinstance(value, str) else ""


def _domain(address: str) -> str:
    email_address = parseaddr(address)[1].strip()
    return email_address.rsplit("@", 1)[-1].casefold().strip(".") if "@" in email_address else ""


def _host(url: str) -> str:
    try:
        return (urlsplit(url).hostname or "").casefold().strip(".")
    except ValueError:
        return ""


def _shorten(text: str, limit: int = MAX_EVIDENCE_CHARS) -> str:
    clean = re.sub(r"\s+", " ", text).strip()
    if len(clean) > limit:
        return clean[: limit - 1].rstrip() + "…"
    return clean


def _excerpt(text: str, matched: re.Match[str]) -> str:
    start = max(0, matched.start() - 32)
    end = min(len(text), matched.end() + 50)
    return _shorten(text[start:end])


def _safe_match(pattern: re.Pattern[str], text: str) -> re.Match[str] | None:
    for matched in pattern.finditer(text):
        # "Never provide your password" is safety advice, not an instruction.
        before = text[max(0, matched.start() - 30) : matched.start()]
        if _NEGATED_REQUEST.search(before):
            continue
        return matched
    return None


def _add(
    indicators: list[dict[str, str]],
    code: str,
    category: str,
    severity: str,
    title: str,
    description: str,
    evidence: str,
    recommendation: str,
) -> None:
    if len(indicators) >= MAX_INDICATORS or any(item["code"] == code for item in indicators):
        return
    indicators.append({
        "code": code,
        "category": category,
        "severity": severity,
        "title": title,
        "description": description,
        "evidence": _shorten(evidence),
        "recommendation": recommendation,
    })


def analyze_email(message: Mapping[str, Any]) -> dict[str, Any]:
    """Return email-specific indicators without changing ML classification.

    The incoming dictionary is parsed Gmail message. Content is
    treated as untrusted data; no URL is fetched and no attachment is opened.
    """
    subject = _text(message.get("subject"))
    body = _text(message.get("body"))
    review_text = (subject + "\n" + body)[:MAX_ANALYSIS_CHARS]
    indicators: list[dict[str, str]] = []

    sensitive = _safe_match(_SENSITIVE_REQUEST, review_text)
    if sensitive:
        _add(
            indicators, "sensitive-information-request", "language", "elevated",
            "Sensitive information requested",
            "The message asks for a password, verification code, or other sensitive details.",
            _excerpt(review_text, sensitive),
            "Do not send sensitive information in a reply. Visit the organization's known website or contact it independently.",
        )

    payment = _safe_match(_PAYMENT_REQUEST, review_text)
    if payment:
        _add(
            indicators, "payment-request", "language", "caution",
            "Payment-related instruction",
            "The message includes an instruction involving payment or financial information.",
            _excerpt(review_text, payment),
            "Confirm unexpected payment requests using a contact method you already trust.",
        )

    urgent = _safe_match(_URGENCY, review_text)
    if urgent:
        _add(
            indicators, "urgent-language", "language", "caution",
            "Time pressure or urgent wording",
            "The email contains language that creates urgency or a deadline.",
            _excerpt(review_text, urgent),
            "Take time to verify the request instead of acting solely because of a deadline.",
        )

    sender_address = _text(message.get("sender_address")) or _text(message.get("sender"))
    reply_to = _text(message.get("reply_to"))
    sender_domain = _domain(sender_address)
    reply_domain = _domain(reply_to)
    if sender_domain and reply_domain and sender_domain != reply_domain:
        _add(
            indicators, "reply-to-domain-difference", "identity", "caution",
            "Reply-To address differs from sender domain",
            "Replies are directed to a different domain than the visible From address. This can be legitimate for support or mailing services.",
            f"From: {sender_domain} | Reply-To: {reply_domain}",
            "Confirm the reply address before sharing personal information.",
        )

    sender_name = _text(message.get("sender_name"))
    claimed_host = _HOST_LABEL.search(sender_name.strip()) if sender_name else None
    if claimed_host and sender_domain:
        claimed = claimed_host.group(1).casefold().removeprefix("www.")
        if sender_domain != claimed and not sender_domain.endswith("." + claimed):
            _add(
                indicators, "sender-name-domain-difference", "identity", "caution",
                "Sender name and email domain differ",
                "The display name mentions a website domain that does not match the sender's email domain.",
                f"Name: {sender_name} | From: {sender_domain}",
                "Check the full sender address and independently verify the claimed organization.",
            )

    links = message.get("links") or []
    if isinstance(links, list):
        for link in links[:40]:
            if not isinstance(link, dict):
                continue
            url = _text(link.get("url"))
            label = _text(link.get("display_text")).strip()
            host = _host(url)
            if not host:
                continue
            try:
                parsed_url = urlsplit(url)
            except ValueError:
                continue

            label_match = _HOST_LABEL.fullmatch(label)
            if label_match:
                visible_host = label_match.group(1).casefold().removeprefix("www.")
                actual_host = host.removeprefix("www.")
                if visible_host != actual_host:
                    _add(
                        indicators, "visible-link-destination-mismatch", "link", "elevated",
                        "Visible link and destination differ",
                        "A link displays one website address but points to a different host. Redirects can also occur in legitimate newsletters.",
                        f"Shown: {visible_host} | Destination: {actual_host}",
                        "Review the destination carefully. Navigate to the service directly instead of using an unexpected email link.",
                    )

            if parsed_url.username is not None:
                _add(
                    indicators, "link-userinfo", "link", "elevated",
                    "Link contains an embedded username",
                    "A link contains an @-separated username section that can make its destination less obvious.",
                    f"Destination host: {host}",
                    "Avoid the link and navigate to the known service directly.",
                )

            try:
                ipaddress.ip_address(host)
            except ValueError:
                pass
            else:
                _add(
                    indicators, "link-ip-address", "link", "caution",
                    "Link points directly to an IP address",
                    "A link uses a numeric network address instead of a familiar website name.",
                    f"Destination: {host}",
                    "Verify the destination independently before visiting it.",
                )

    attachments = message.get("attachments") or []
    if isinstance(attachments, list):
        for attachment in attachments[:40]:
            if not isinstance(attachment, dict):
                continue
            filename = _text(attachment.get("filename")).strip()
            if filename and any(filename.casefold().endswith(ext) for ext in _DANGEROUS_SUFFIXES):
                _add(
                    indicators, "executable-attachment", "attachment", "elevated",
                    "Attachment can run code",
                    "The attachment filename ends with an executable or script-related extension. The file was not opened.",
                    f"Filename: {filename}",
                    "Do not open unexpected executable or script attachments. Verify with the sender through a known channel.",
                )
                break

    return {
        "indicators": indicators,
        "recommendations": list(dict.fromkeys(
            item["recommendation"] for item in indicators
        ))[:5],
        "note": _ANALYSIS_NOTE,
    }
