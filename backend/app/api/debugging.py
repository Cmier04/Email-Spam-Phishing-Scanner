"""Local configuration and opt-in developer-only Python test diagnostics."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict

from app.services.device_ai_settings import resolved_ai_configuration, save_override
from app.services.python_test_runner import list_tests, run_test, testing_allowed

router = APIRouter(tags=['debugging'])


class AIConfigurationUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    mode: str
    enabled: bool | None = None
    gpu_layers: int | None = None
    threads: int | None = None
    context_size: int | None = None
    batch_size: int | None = None
    generation_timeout_seconds: int | None = None


@router.get('/debug/ai-settings')
def get_ai_settings() -> dict:
    return resolved_ai_configuration()


@router.put('/debug/ai-settings')
def set_ai_settings(settings: AIConfigurationUpdate, request: Request) -> dict:
    if request.client is None or request.client.host not in ('127.0.0.1', '::1', 'localhost'):
        raise HTTPException(403, detail='AI settings are editable from the local app only.')
    if request.headers.get('x-phishlab-local-settings') != 'save':
        raise HTTPException(403, detail='Local AI settings request header is required.')
    origin = request.headers.get('origin')
    if origin and origin not in {'http://localhost:5173', 'http://127.0.0.1:5173'}:
        raise HTTPException(403, detail='AI settings are editable from the local app only.')
    try:
        save_override(settings.model_dump(exclude_none=True))
        return resolved_ai_configuration()
    except ValueError as exc:
        raise HTTPException(422, detail=str(exc)) from exc


def _require_local_tests(request: Request) -> None:
    if not testing_allowed(request.client.host if request.client else ''):
        raise HTTPException(404, detail='Python tests are not available in this environment.')


@router.get('/debug/python-tests')
def get_python_tests(request: Request) -> dict:
    _require_local_tests(request)
    return {'enabled': True, 'tests': list_tests()}


class TestRunRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    test_id: str


@router.post('/debug/python-tests/run')
def execute_python_test(request: Request, body: TestRunRequest) -> dict:
    _require_local_tests(request)
    if request.headers.get('x-phishlab-local-tests') != 'run':
        raise HTTPException(403, detail='A local test-run request header is required.')
    origin = request.headers.get('origin')
    if origin and origin not in {'http://localhost:5173', 'http://127.0.0.1:5173'}:
        raise HTTPException(403, detail='Test runner is only available from the local app.')
    try:
        return run_test(body.test_id)
    except ValueError as exc:
        raise HTTPException(400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(409, detail=str(exc)) from exc
