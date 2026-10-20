from pathlib import Path
import joblib


MODEL_PATH = (
    Path(__file__).resolve().parents[2]
    / "model"
    / "email_classifier.pkl"
)

model = joblib.load(MODEL_PATH)


def classify_email(subject: str, body: str):
    text = f"{subject} {body}"

    prediction = model.predict([text])[0]

    probabilities = model.predict_proba([text])[0]

    confidence = max(probabilities) * 100

    if prediction == 1:
        classification = "Potential threat"
    else:
        classification = "Legitimate"

    return {
        "classification": classification,
        "confidence": round(float(confidence), 2),
    }