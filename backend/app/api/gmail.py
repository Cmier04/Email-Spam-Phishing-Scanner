"""FastAPI routes for local Gmail account management and message scanning."""

import logging
import json
from ipaddress import ip_address
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status

from app.models.schemas import (
    GmailConnectionResponse,
    GmailDisconnectResponse,
    GmailMessageResponse,
)
from app.services.classifier_service import ClassifierUnavailableError, ClassifierPredictionError
from app.services.gmail_service import (
    GmailAPIError,
    GmailAuthenticationError,
    GmailConfigurationError,
    NoGmailMessagesError,
    connect_gmail_account,
    configure_gmail_oauth_client,
    disconnect_gmail_account,
    get_gmail_connection_status,
    get_google_avatar,
    scan_latest_message,
    scan_recent_messages,
)


router = APIRouter(prefix="/gmail", tags=["gmail"])
LOGGER = logging.getLogger(__name__)


def _record_scan_results(records: list[dict]) -> None:
    """Do not let optional storage errors interrupt actual Gmail scans."""
    from app.services.scan_history_service import HistoryUnavailable, record_scans
    try:
        record_scans(records, "gmail")
    except HistoryUnavailable:
        LOGGER.warning("Optional scan history unavailable; Gmail scan still succeeded.")

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
    if isinstance(error, (ClassifierUnavailableError, ClassifierPredictionError)):
        raise error  # Handled centrally with safe status and message.
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


@router.get("/status", response_model=GmailConnectionResponse,
            dependencies=[Depends(require_local_state_change)])
def gmail_connection_status():
    return get_gmail_connection_status()


@router.post("/oauth-client", response_model=GmailConnectionResponse,
             dependencies=[Depends(require_local_state_change)])
async def import_gmail_oauth_client(request: Request):
    """Configure a bounded OAuth Desktop client from a trusted local UI."""
    try:
        size = int(request.headers.get("content-length", "0"))
    except ValueError:
        size = 16385
    if size > 16384:
        raise HTTPException(status_code=413, detail="OAuth client JSON exceeds 16 KB.")
    # Read in bounded chunks even when the client omits Content-Length.
    chunks, total = [], 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > 16384:
            raise HTTPException(status_code=413, detail="OAuth client JSON exceeds 16 KB.")
        chunks.append(chunk)
    try:
        configuration = json.loads(b"".join(chunks))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail="Select a valid JSON OAuth client file.") from exc
    try:
        return configure_gmail_oauth_client(configuration)
    except GmailConfigurationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


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


@router.get("/latest", response_model=GmailMessageResponse,
            dependencies=[Depends(require_local_state_change)])
def latest_gmail_message():
    try:
        result = scan_latest_message()
        _record_scan_results([result])
        return result
    except Exception as error:
        _raise_http_error(error)


@router.get("/recent", response_model=list[GmailMessageResponse],
            dependencies=[Depends(require_local_state_change)])
def recent_gmail_messages(limit: int = Query(default=10, ge=1, le=50)):
    try:
        results = scan_recent_messages(max_results=limit)
        _record_scan_results(results)
        return results
    except Exception as error:
        _raise_http_error(error)


@router.get("/avatar", dependencies=[Depends(require_local_state_change)])
def gmail_avatar() -> Response:
    if not get_gmail_connection_status().get("connected"):
        raise HTTPException(status_code=404, detail="No connected Gmail profile.")
    image = get_google_avatar()
    if not image:
        raise HTTPException(status_code=404, detail="Google profile picture unavailable.")
    content, mime = image
    return Response(content=content, media_type=mime, headers={"Cache-Control": "private, max-age=60", "X-Content-Type-Options": "nosniff"})
