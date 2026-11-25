"""FastAPI routes for local Gmail account management and message scanning."""

from ipaddress import ip_address
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.models.schemas import (
    GmailConnectionResponse,
    GmailDisconnectResponse,
    GmailMessageResponse,
)
from app.services.gmail_service import (
    GmailAPIError,
    GmailAuthenticationError,
    GmailConfigurationError,
    NoGmailMessagesError,
    connect_gmail_account,
    disconnect_gmail_account,
    get_gmail_connection_status,
    scan_latest_message,
    scan_recent_messages,
)


router = APIRouter(prefix="/gmail", tags=["gmail"])
ALLOWED_BROWSER_ORIGINS = {
    "http://localhost:5173",
    "http://127.0.0.1:5173",
}


def require_local_state_change(request: Request) -> None:
    """Reject account mutations from non-loopback clients or foreign websites."""
    client_host = request.client.host if request.client else ""
    try:
        if not ip_address(client_host).is_loopback:
            raise ValueError
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Gmail account changes are only available from this computer.",
        ) from exc

    origin = request.headers.get("origin")
    if origin:
        parsed = urlsplit(origin)
        normalized_origin = f"{parsed.scheme}://{parsed.netloc}"
        if normalized_origin not in ALLOWED_BROWSER_ORIGINS:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This website cannot change the Gmail connection.",
            )


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


@router.get("/status", response_model=GmailConnectionResponse)
def gmail_connection_status():
    return get_gmail_connection_status()


@router.post(
    "/connect",
    response_model=GmailConnectionResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_local_state_change)],
)
def connect_gmail():
    try:
        return connect_gmail_account()
    except Exception as error:
        _raise_http_error(error)


@router.post(
    "/disconnect",
    response_model=GmailDisconnectResponse,
    dependencies=[Depends(require_local_state_change)],
)
def disconnect_gmail():
    try:
        return {
            **disconnect_gmail_account(),
            "google_permission_revoked": False,
        }
    except Exception as error:
        _raise_http_error(error)


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
