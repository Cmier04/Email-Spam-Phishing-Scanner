# Email Spam/Phishing Scanner
A desktop application which classifies, notifies, and teaches users about spam and phishing emails using a machine learning model.

This repository houses the frontend/backend implementation and utilizes the machine learning model developed in a separate repo:  
>[Email Spam/Phishing Classifier](https://github.com/MW562/email_spam-phishing_classifier)

## Learning Lab API

The backend exposes `POST /api/what-if`. It retrieves one Gmail message by its
opaque Gmail ID, applies predefined transformations to an in-memory copy, and
compares the trained classifier's original and modified results. Gmail access
remains read-only; mock IDs such as `gmail_001` are frontend demo data and are
not valid Gmail API IDs.

Run the backend from `backend` with `uvicorn app.main:app --reload`, then open
`http://127.0.0.1:8000/docs` to try the endpoint. For example:

```json
{
  "email_id": "REAL_GMAIL_MESSAGE_ID",
  "transformations": [
    {"part": "subject", "transformation_id": "subject-wording"},
    {"part": "formatting", "transformation_id": "layout-compact"}
  ]
}
```

Scores in the response are percentages from 0 to 100. `score_change` is the
modified malicious probability minus the original malicious probability, in
percentage points. Components not separately exposed by Gmail parsing are left
unchanged and reported through transformation results and warnings.
