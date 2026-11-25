from typing import Literal

from pydantic import BaseModel, Field, field_validator


class EmailClassificationRequest(BaseModel):
    subject: str
    body: str

    @field_validator("subject", "body")
    @classmethod
    def strip_whitespace(cls, value: str):
        return value.strip()


class EmailClassificationResponse(BaseModel):
    classification: str
    confidence: float


class GmailLink(BaseModel):
    display_text: str
    url: str


class GmailAttachment(BaseModel):
    filename: str
    mime_type: str
    size: int = Field(ge=0)


class EmailSecurityIndicator(BaseModel):
    code: str
    category: Literal["language", "identity", "link", "attachment"]
    severity: Literal["caution", "elevated"]
    title: str
    description: str
    evidence: str
    recommendation: str


class EmailSecurityAnalysis(BaseModel):
    indicators: list[EmailSecurityIndicator] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    note: str = ""


class GmailMessageResponse(EmailClassificationResponse):
    id: str
    thread_id: str
    sender: str
    sender_name: str = ""
    sender_address: str = ""
    reply_to: str = ""
    recipient: str
    subject: str
    date: str
    snippet: str
    body: str
    greeting: str = ""
    request: str = ""
    link_text: str = ""
    links: list[GmailLink] = Field(default_factory=list)
    attachment: str = ""
    attachments: list[GmailAttachment] = Field(default_factory=list)
    signature: str = ""
    security_analysis: EmailSecurityAnalysis = Field(default_factory=EmailSecurityAnalysis)


class GmailConnectionResponse(BaseModel):
    state: Literal["disconnected", "connecting", "connected", "failed", "cancelled"]
    connected: bool
    email: str | None = None
    error: str | None = None
    credentials_configured: bool


class GmailDisconnectResponse(GmailConnectionResponse):
    google_permission_revoked: Literal[False] = False


class DemoEmailResponse(EmailClassificationResponse):
    id: str
    source: Literal["demo"]
    sender: str
    sender_address: str
    subject: str
    preview: str
    received_at: str
    malicious_probability: float = Field(ge=0, le=100)
    risk: Literal["Low", "Medium", "High"]
    threat_category: str | None = None
    greeting: str
    body: str
    request: str
    action_label: str | None = None
    attachment: str | None = None
    signature: str | None = None
    security_analysis: EmailSecurityAnalysis = Field(default_factory=EmailSecurityAnalysis)


class WhatIfTransformationRequest(BaseModel):
    part: str
    transformation_id: str

    @field_validator("part", "transformation_id")
    @classmethod
    def strip_and_require_value(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Value cannot be empty.")
        return value


class WhatIfRequest(BaseModel):
    email_id: str
    transformations: list[WhatIfTransformationRequest] = Field(min_length=1)
    include_summary: bool = True
    ai_mode: Literal["automatic", "require_qwen"] = "automatic"

    @field_validator("email_id")
    @classmethod
    def strip_and_require_email_id(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("email_id cannot be empty.")
        return value


class AppliedTransformation(BaseModel):
    part: str
    transformation_id: str
    applied: bool
    affects_classifier: bool
    message: str
    generation_method: Literal["deterministic", "local_ai", "fallback"] = "deterministic"
    fallback_reason: Literal[
        "disabled", "local_model_unavailable", "invalid_ai_response",
        "generation_timeout", "generation_failed"
    ] | None = None
    ai_duration_ms: float | None = Field(default=None, ge=0)


class LearningSummary(BaseModel):
    # Explains what was observed, not the internal reasoning of the classifier.
    source: Literal["dynamic", "local_ai"]
    changes_made: list[str]
    why_it_mattered: str
    what_you_should_learn: str
    fallback_reason: Literal[
        "disabled", "local_model_unavailable", "invalid_ai_response",
        "generation_timeout", "generation_failed"
    ] | None = None
    ai_duration_ms: float | None = Field(default=None, ge=0)


class WhatIfResponse(BaseModel):
    email_id: str
    ai_mode: Literal["automatic", "require_qwen"] = "automatic"
    source: Literal["gmail", "demo"]
    original_classification: str
    original_confidence: float = Field(ge=0, le=100)
    original_malicious_probability: float = Field(ge=0, le=100)
    modified_classification: str
    modified_confidence: float = Field(ge=0, le=100)
    modified_malicious_probability: float = Field(ge=0, le=100)
    score_change: float = Field(ge=-100, le=100)
    decision_changed: bool
    applied_transformations: list[AppliedTransformation]
    modified_subject: str
    modified_body: str
    modified_values: dict[str, str]
    warnings: list[str]
    learning_summary: LearningSummary | None = None
