from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.api.debugging import router as debugging_router
from app.api.system import router as system_router
from app.api.history import router as history_router
from app.services.classifier_service import ClassifierUnavailableError, ClassifierPredictionError
from app.api.classify import router as classify_router
from app.api.demo import router as demo_router
from app.api.gmail import router as gmail_router
from app.api.learning_lab import router as learning_lab_router


app = FastAPI(
    title="Email Spam and Phishing Scanner API"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {
        "message": "Email Spam and Phishing Scanner API"
    }


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "message": "Backend is running",
    }


app.include_router(
    classify_router,
    prefix="/api",
)

app.include_router(
    gmail_router,
    prefix="/api",
)

app.include_router(
    learning_lab_router,
    prefix="/api",
)

app.include_router(
    demo_router,
    prefix="/api",
)


app.include_router(debugging_router, prefix="/api")


@app.exception_handler(ClassifierUnavailableError)
async def classifier_unavailable_handler(request: Request, exc: ClassifierUnavailableError):
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@app.exception_handler(ClassifierPredictionError)
async def classifier_prediction_handler(request: Request, exc: ClassifierPredictionError):
    return JSONResponse(status_code=503, content={"detail": str(exc)})


app.include_router(system_router, prefix="/api")
app.include_router(history_router, prefix="/api")
