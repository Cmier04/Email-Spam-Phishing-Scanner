from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    EmailClassificationRequest,
    EmailClassificationResponse,
)
from app.services.classifier_service import classify_email


router = APIRouter()


@router.post(
    "/classify",
    response_model=EmailClassificationResponse,
)
def classify(request: EmailClassificationRequest):

    if not request.subject and not request.body:
        raise HTTPException(
            status_code=400,
            detail="Subject and body cannot both be empty."
        )

    return classify_email(
        request.subject,
        request.body,
    )