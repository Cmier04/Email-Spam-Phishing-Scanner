"""Lazy, validated loading of the locally trained phishing classifier."""
from __future__ import annotations

import math
import os
from pathlib import Path
from threading import RLock
from typing import Any

import joblib

MODEL_PATH = Path(os.getenv("PHISHLAB_CLASSIFIER_MODEL_PATH",
                            str(Path(__file__).resolve().parents[2] / "model" / "email_classifier.pkl"))).expanduser()
_MODEL_LOCK = RLock()

# Keep the historical injectable module-level model for existing tests and
# consumers. Loading is deferred so installing a model does not require a
# reload or prevent Settings / diagnostics from opening.
model: Any | None = None


class ClassifierUnavailableError(FileNotFoundError):
    """A trusted, loadable classifier has not been installed."""


class ClassifierPredictionError(RuntimeError):
    """The loaded classifier returned an invalid result or could not predict."""


def _get_model() -> Any:
    global model
    if model is not None:
        return model
    if not MODEL_PATH.is_file():
        raise ClassifierUnavailableError(
            "The trained email classifier is not installed at backend/model/email_classifier.pkl."
        )
    with _MODEL_LOCK:
        if model is None:
            try:
                # Only load a classifier supplied by the project team. Pickle
                # is executable and must never come from an email or upload.
                loaded = joblib.load(MODEL_PATH)
                if not all(hasattr(loaded, attr) for attr in ("predict", "predict_proba", "classes_")):
                    raise ValueError("Missing classifier interface")
            except Exception as exc:
                raise ClassifierUnavailableError(
                    "The installed classifier could not be loaded. Reinstall the trusted trained model."
                ) from exc
            model = loaded
    return model


def classifier_available() -> bool:
    """Safe readiness check: no model content, paths or email text returned."""
    try:
        _get_model()
        return True
    except ClassifierUnavailableError:
        return False


def _to_python_scalar(value: Any) -> Any:
    return value.item() if hasattr(value, "item") else value


def classify_email_detailed(subject: str, body: str) -> dict:
    """Return classifier prediction and validated class-1 malicious probability."""
    classifier = _get_model()
    try:
        text = f"{subject} {body}"
        prediction = _to_python_scalar(classifier.predict([text])[0])
        classes = [_to_python_scalar(label) for label in classifier.classes_]
        probabilities = [float(p) for p in classifier.predict_proba([text])[0]]
        if len(classes) != 2 or set(classes) != {0, 1} or len(probabilities) != 2:
            raise ValueError("Unexpected classifier labels")
        if prediction not in classes:
            raise ValueError("Unexpected prediction label")
        if any(not math.isfinite(p) or not 0.0 <= p <= 1.0 for p in probabilities):
            raise ValueError("Invalid class probabilities")
        if not math.isclose(sum(probabilities), 1.0, abs_tol=1e-3):
            raise ValueError("Probabilities are not normalized")
        predicted_index = classes.index(prediction)
        malicious_index = classes.index(1)
        return {
            "classification": "Potential threat" if prediction == 1 else "Legitimate",
            "confidence": round(probabilities[predicted_index] * 100, 2),
            "malicious_probability": round(probabilities[malicious_index] * 100, 2),
        }
    except Exception as exc:
        # Do not echo email text, model internals or serialized model paths.
        raise ClassifierPredictionError(
            "The installed classifier could not analyze this email. Check the model and try again."
        ) from exc


def classify_email(subject: str, body: str) -> dict:
    """Preserve the original public classifier response contract."""
    result = classify_email_detailed(subject, body)
    return {"classification": result["classification"], "confidence": result["confidence"]}
