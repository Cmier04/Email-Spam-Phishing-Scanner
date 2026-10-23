from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.classify import router as classify_router
from app.api.gmail import router as gmail_router


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
