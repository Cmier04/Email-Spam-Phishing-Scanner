"""Non-sensitive component readiness, for local installation troubleshooting."""
from fastapi import APIRouter, Depends

from app.api.gmail import require_local_state_change
from app.services.classifier_service import classifier_available
from app.services.gmail_service import CREDENTIALS_PATH
from app.services.local_ai_summary_service import get_local_ai_status

router = APIRouter(tags=["system"])


@router.get("/system/status", dependencies=[Depends(require_local_state_change)])
def system_status() -> dict:
    """No email, OAuth token, model contents, device secrets or paths exposed."""
    classifier_ready = classifier_available()
    ai = get_local_ai_status()
    return {
        "status": "ready" if classifier_ready else "setup_required",
        "classifier_ready": classifier_ready,
        "qwen_enabled": bool(ai["enabled"]),
        "qwen_model_available": bool(ai["model_file_available"]),
        "gmail_credentials_configured": CREDENTIALS_PATH.is_file(),
        "message": (
            "Core email classification is available."
            if classifier_ready else
            "Install your trusted trained email classifier to enable scans."
        ),
    }
