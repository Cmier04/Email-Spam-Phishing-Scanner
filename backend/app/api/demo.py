"""API routes for deterministic synthetic demonstration emails."""

import logging
from fastapi import APIRouter

from app.models.schemas import DemoEmailResponse
from app.services.demo_email_service import list_demo_emails


router = APIRouter(prefix="/demo", tags=["demo"])
LOGGER = logging.getLogger(__name__)


@router.get("/emails", response_model=list[DemoEmailResponse])
def demo_emails() -> list[DemoEmailResponse]:
    results = list_demo_emails()
    # Recording demo classifications is optional and never blocks the demo.
    from app.services.scan_history_service import HistoryUnavailable, record_scans
    try:
        record_scans((item.model_dump() for item in results), "demo")
    except HistoryUnavailable:
        LOGGER.warning("Optional scan history unavailable; demo classification still succeeded.")
    return results
