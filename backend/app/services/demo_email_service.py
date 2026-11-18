"""Deterministic synthetic emails for demonstrations without Gmail OAuth."""

from __future__ import annotations

from dataclasses import dataclass

from app.models.schemas import DemoEmailResponse
from app.services.classifier_service import classify_email_detailed


class DemoEmailNotFoundError(LookupError):
    """Raised when a reserved demo email ID does not exist."""


@dataclass(frozen=True)
class DemoEmail:
    id: str
    sender: str
    sender_address: str
    subject: str
    received_at: str
    risk: str
    greeting: str
    body: str
    request: str
    signature: str
    threat_category: str | None = None
    action_label: str | None = None
    attachment: str | None = None

    @property
    def classifier_body(self) -> str:
        return "\n".join(
            part
            for part in (self.greeting, self.body, self.request, self.signature)
            if part
        )

    def as_experiment_email(self) -> dict:
        """Return a fresh normalized message for the shared experiment logic."""
        return {
            "id": self.id,
            "thread_id": "",
            "sender": f"{self.sender} <{self.sender_address}>",
            "recipient": "employee@example.com",
            "subject": self.subject,
            "date": self.received_at,
            "snippet": self.body,
            "body": self.classifier_body,
        }


DEMO_EMAILS: tuple[DemoEmail, ...] = (
    DemoEmail(
        id="demo-001",
        sender="Account Security",
        sender_address="security-alert@secure-mailbox.example",
        subject="URGENT: Verify your bank account immediately",
        received_at="2026-11-04T09:18:00-08:00",
        risk="High",
        threat_category="phishing",
        greeting="Dear customer,",
        body="Your account has been compromised and will be suspended.",
        request=(
            "Please click now to verify your password and banking information "
            "within 24 hours."
        ),
        action_label="Verify account now",
        attachment="Account_Notice.pdf",
        signature="Account Security Team",
    ),
    DemoEmail(
        id="demo-002",
        sender="Maya Chen",
        sender_address="maya.chen@example.com",
        subject="Reminder: Team planning meeting tomorrow",
        received_at="2026-11-04T10:42:00-08:00",
        risk="Low",
        greeting="Hello Alex,",
        body="Our weekly planning meeting is tomorrow at 10 AM.",
        request="Please review the agenda in the shared team workspace.",
        signature="Maya",
    ),
)

_DEMO_EMAILS_BY_ID = {email.id: email for email in DEMO_EMAILS}


def is_demo_email_id(email_id: str) -> bool:
    return email_id.startswith("demo-")


def get_demo_email(email_id: str) -> DemoEmail:
    try:
        return _DEMO_EMAILS_BY_ID[email_id]
    except KeyError as exc:
        raise DemoEmailNotFoundError(
            f"Synthetic demo email '{email_id}' was not found."
        ) from exc


def get_demo_experiment_email(email_id: str) -> dict:
    return get_demo_email(email_id).as_experiment_email()


def list_demo_emails() -> list[DemoEmailResponse]:
    """Classify and return fresh API representations of every demo email."""
    responses: list[DemoEmailResponse] = []
    for email in DEMO_EMAILS:
        result = classify_email_detailed(email.subject, email.classifier_body)
        responses.append(
            DemoEmailResponse(
                id=email.id,
                source="demo",
                sender=email.sender,
                sender_address=email.sender_address,
                subject=email.subject,
                preview=email.body,
                received_at=email.received_at,
                classification=result["classification"],
                confidence=result["confidence"],
                malicious_probability=result["malicious_probability"],
                risk=email.risk,
                threat_category=email.threat_category,
                greeting=email.greeting,
                body=email.body,
                request=email.request,
                action_label=email.action_label,
                attachment=email.attachment,
                signature=email.signature,
            )
        )
    return responses
