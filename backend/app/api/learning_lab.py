"""Learning Lab API routes."""

from fastapi import APIRouter, HTTPException

from app.models.schemas import WhatIfRequest, WhatIfResponse
from app.services.demo_email_service import DemoEmailNotFoundError
from app.services.gmail_service import (
    GmailAPIError,
    GmailAuthenticationError,
    GmailConfigurationError,
    GmailMessageNotFoundError,
)
from app.services.learning_lab_service import (
    LearningLabValidationError,
    QwenRequiredError,
    run_what_if_experiment,
)


router = APIRouter(tags=["learning-lab"])


@router.get("/ai-status")
def ai_status() -> dict:
    from app.services.local_ai_summary_service import get_local_ai_status
    return get_local_ai_status()


@router.post("/what-if", response_model=WhatIfResponse)
def what_if(request: WhatIfRequest) -> WhatIfResponse:
    try:
        return run_what_if_experiment(
            request.email_id, request.transformations,
            include_summary=request.include_summary,
            ai_mode=request.ai_mode,
        )
    except QwenRequiredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except LearningLabValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except GmailMessageNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except DemoEmailNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except GmailConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except GmailAuthenticationError as exc:
        raise HTTPException(
            status_code=502, detail="Gmail authentication could not be completed."
        ) from exc
    except GmailAPIError as exc:
        raise HTTPException(
            status_code=502, detail="Gmail could not be reached. Please try again later."
        ) from exc
