from pathlib import Path
from typing import Any

import joblib


MODEL_PATH = (
    Path(__file__).resolve().parents[2]
    / "model"
    / "email_classifier.pkl"
)

# Keep diagnostics and local settings available when the optional classifier
# artifact was not included in a source-only archive. Classification still
# requires the trained artifact and never substitutes a made-up prediction.
model = joblib.load(MODEL_PATH) if MODEL_PATH.is_file() else None


def _to_python_scalar(value: Any) -> Any:
    """Convert NumPy scalar labels without requiring NumPy at this boundary."""
    return value.item() if hasattr(value, "item") else value


def classify_email_detailed(subject: str, body: str) -> dict:
    """Classify subject/body and expose correctly labelled probabilities.

    The trained model uses class ``1`` for malicious email.  Looking that class
    up in ``classes_`` avoids assuming the malicious score is either the final
    probability or the maximum probability.
    """
    if model is None:
        raise FileNotFoundError("The trained email classifier is not installed at backend/model/email_classifier.pkl")
    text = f"{subject} {body}"
    prediction = model.predict([text])[0]
    probabilities = model.predict_proba([text])[0]

    classes = [_to_python_scalar(label) for label in model.classes_]
    prediction_label = _to_python_scalar(prediction)
    try:
        predicted_index = classes.index(prediction_label)
        malicious_index = classes.index(1)
    except ValueError as exc:
        raise RuntimeError(
            "The classifier does not expose the expected binary class labels."
        ) from exc

    classification = (
        "Potential threat" if prediction_label == 1 else "Legitimate"
    )

    return {
        "classification": classification,
        "confidence": round(float(probabilities[predicted_index]) * 100, 2),
        "malicious_probability": round(
            float(probabilities[malicious_index]) * 100, 2
        ),
    }


def classify_email(subject: str, body: str) -> dict:
    """Preserve the original public classifier response contract."""
    result = classify_email_detailed(subject, body)

    return {
        "classification": result["classification"],
        "confidence": result["confidence"],
    }
