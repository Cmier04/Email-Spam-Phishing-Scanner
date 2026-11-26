"""Local-only, opt-in scan history and model feedback endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.gmail import require_local_state_change
from app.services import scan_history_service as history

router = APIRouter(prefix="/history", tags=["history"], dependencies=[Depends(require_local_state_change)])


class HistorySettingsRequest(BaseModel):
    enabled: bool
    retention_days: int = Field(default=90)


class HistoryFeedbackRequest(BaseModel):
    verdict: str = Field(max_length=16)
    note: str = Field(default="", max_length=500)


def _call(func, *args, **kwargs):
    try:
        return func(*args, **kwargs)
    except history.HistoryNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except history.HistoryUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/status")
def history_status() -> dict:
    return history.history_status()


@router.put("/settings")
def history_settings(payload: HistorySettingsRequest) -> dict:
    return _call(history.update_history_settings, enabled=payload.enabled,
                 retention_days=payload.retention_days)


@router.get("/scans")
def get_scans(limit: int = Query(default=50, ge=1, le=100),
              offset: int = Query(default=0, ge=0, le=10000)) -> dict:
    return _call(history.list_history, limit=limit, offset=offset)


@router.put("/scans/{scan_id}/feedback")
def set_feedback(scan_id: int, payload: HistoryFeedbackRequest) -> dict:
    return _call(history.save_feedback, scan_id, payload.verdict, payload.note)


@router.delete("/scans/{scan_id}")
def delete_scan(scan_id: int) -> dict:
    return _call(history.delete_scan, scan_id)


@router.delete("/scans")
def delete_all_scans() -> dict:
    result = _call(history.clear_history)
    from app.services.lab_history_service import clear_lab_sessions
    _call(clear_lab_sessions)
    return result


# Lab sessions are a separate, explicitly opt-in history dataset. Only the
# selected changes and educational copy are stored; Gmail is never modified.
class LabSessionRequest(BaseModel):
    email: dict
    experiment: dict
    changes: list[dict]
    selected_part: str = 'subject'


@router.get('/labs')
def list_labs(limit: int = Query(default=40, ge=1, le=100),
              offset: int = Query(default=0, ge=0, le=10000)) -> dict:
    from app.services.lab_history_service import list_lab_sessions
    return _call(list_lab_sessions, limit=limit, offset=offset)


@router.get('/labs/{lab_id}')
def get_lab(lab_id: int) -> dict:
    from app.services.lab_history_service import get_lab_session
    return _call(get_lab_session, lab_id)


@router.put('/labs')
def save_lab(payload: LabSessionRequest) -> dict:
    from app.services.lab_history_service import save_lab_session
    return _call(save_lab_session, payload.model_dump())


@router.delete('/labs/{lab_id}')
def delete_lab(lab_id: int) -> dict:
    from app.services.lab_history_service import delete_lab_session
    return _call(delete_lab_session, lab_id)


class EmailFeedbackRequest(HistoryFeedbackRequest):
    source: str = Field(max_length=12)
    email_id: str = Field(min_length=1, max_length=256)


@router.post('/feedback/by-email')
def submit_email_feedback(payload: EmailFeedbackRequest) -> dict:
    return _call(history.save_feedback_for_email, payload.source, payload.email_id,
                 payload.verdict, payload.note)
