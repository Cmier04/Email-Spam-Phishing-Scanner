"""API routes for deterministic synthetic demonstration emails."""

from fastapi import APIRouter

from app.models.schemas import DemoEmailResponse
from app.services.demo_email_service import list_demo_emails


router = APIRouter(prefix="/demo", tags=["demo"])


@router.get("/emails", response_model=list[DemoEmailResponse])
def demo_emails() -> list[DemoEmailResponse]:
    return list_demo_emails()
