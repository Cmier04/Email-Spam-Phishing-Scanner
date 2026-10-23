"""FastAPI routes for reading and classifying Gmail messages."""

from fastapi import APIRouter, HTTPException, Query

from app.models.schemas import GmailMessageResponse
from app.services.gmail_service import (
    GmailAPIError,
    GmailAuthenticationError,
    GmailConfigurationError,
    NoGmailMessagesError,
    scan_latest_message,
    scan_recent_messages,
)


router = APIRouter(prefix="/gmail", tags=["gmail"])


def _raise_http_error(error: Exception) -> None:
    if isinstance(error, GmailConfigurationError):
        raise HTTPException(status_code=503, detail=str(error)) from error
    if isinstance(error, NoGmailMessagesError):
        raise HTTPException(status_code=404, detail=str(error)) from error
    if isinstance(error, GmailAuthenticationError):
        raise HTTPException(
            status_code=502,
            detail="Gmail authentication could not be completed.",
        ) from error
    if isinstance(error, GmailAPIError):
        raise HTTPException(
            status_code=502,
            detail="Gmail could not be reached. Please try again later.",
        ) from error
    raise HTTPException(
        status_code=500,
        detail="The Gmail message could not be processed.",
    ) from error


@router.get("/latest", response_model=GmailMessageResponse)
def latest_gmail_message():
    try:
        return scan_latest_message()
    except Exception as error:
        _raise_http_error(error)


@router.get("/recent", response_model=list[GmailMessageResponse])
def recent_gmail_messages(limit: int = Query(default=10, ge=1, le=50)):
    try:
        return scan_recent_messages(max_results=limit)
    except Exception as error:
        _raise_http_error(error)
