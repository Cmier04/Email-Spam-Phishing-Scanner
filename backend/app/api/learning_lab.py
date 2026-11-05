"""Learning Lab API routes."""

from fastapi import APIRouter, HTTPException

from app.models.schemas import WhatIfRequest, WhatIfResponse
from app.services.gmail_service import (
    GmailAPIError,
    GmailAuthenticationError,
    GmailConfigurationError,
    GmailMessageNotFoundError,
)
from app.services.learning_lab_service import (
    LearningLabValidationError,
    run_what_if_experiment,
)


router = APIRouter(tags=["learning-lab"])


@router.post("/what-if", response_model=WhatIfResponse)
def what_if(request: WhatIfRequest) -> WhatIfResponse:
    try:
        return run_what_if_experiment(request.email_id, request.transformations)
    except LearningLabValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except GmailMessageNotFoundError as exc:
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
