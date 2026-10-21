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