# Email Spam/Phishing Scanner
A desktop application which classifies, notifies, and teaches users about spam and phishing emails using a machine learning model.

This repository houses the frontend/backend implementation and utilizes the machine learning model developed in a separate repo:  
>[Email Spam/Phishing Classifier](https://github.com/MW562/email_spam-phishing_classifier)

## Gmail account connection

Place a Google Desktop OAuth client file at `backend/credentials.json`. Start
the backend and frontend as described below, then open **Settings** and select
**Connect Gmail**. PhishLab opens Google's authorization page and polls the
local backend while authorization is pending. The only requested Gmail scope
is `gmail.readonly`.

The local account-management API is:

- `GET /api/gmail/status` — inspect saved authorization without opening OAuth.
- `POST /api/gmail/connect` — begin a bounded background desktop OAuth flow.
- `POST /api/gmail/disconnect` — delete the local `backend/token.json`.

Disconnecting does not revoke permission in the Google account. Revoke it
separately from the Google Account permissions page if that is desired.
`credentials.json`, `token.json`, and temporary token files are Git-ignored.

### Scanning Gmail from the dashboard

With Gmail connected, open the Dashboard, select **Gmail inbox**, and choose
**Scan emails**. The frontend verifies the saved connection and requests up to
25 recent inbox messages from `GET /api/gmail/recent`. Gmail and synthetic
training results are held separately; use **Training demo** to return to the
synthetic examples without adding them to a Gmail scan.

## Learning Lab API

The backend exposes `POST /api/what-if`. It retrieves one Gmail message by its
opaque Gmail ID, applies predefined transformations to an in-memory copy, and
compares the trained classifier's original and modified results. Gmail access
remains read-only. Reserved IDs such as `demo-001` use deterministic synthetic
messages from `GET /api/demo/emails`, while old mock IDs such as `gmail_001`
are not valid Gmail API IDs.

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

## Browser demo

Start two terminals from the repository root:

```powershell
cd backend
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

```powershell
cd frontend
npm run dev
```

Open `http://127.0.0.1:5173`, select the `demo-001` Account Security email,
open **Learning Lab**, and choose **Use neutral subject wording**. The UI sends
the existing What-If request to FastAPI and displays both real malicious-class
probabilities from the trained model. Set `VITE_API_BASE_URL` to override the
default backend URL of `http://127.0.0.1:8000`.
