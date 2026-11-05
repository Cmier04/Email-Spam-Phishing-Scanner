from pydantic import BaseModel, field_validator


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
