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


class GmailMessageResponse(EmailClassificationResponse):
    id: str
    thread_id: str
    sender: str
    recipient: str
    subject: str
    date: str
    snippet: str
    body: str


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


class WhatIfResponse(BaseModel):
    email_id: str
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
    warnings: list[str]
