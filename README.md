# Email Spam/Phishing Scanner
A desktop application which classifies, notifies, and teaches users about spam and phishing emails using a machine learning model.

This repository houses the frontend/backend implementation and utilizes the machine learning model developed in a separate repo:  
>[Email Spam/Phishing Classifier](https://github.com/MW562/email_spam-phishing_classifier)

## Main features

- **Email scanning:** Analyze messages with the trained spam/phishing classifier and review the results in the dashboard.
- **Gmail and training demo:** Scan a connected Gmail inbox with read-only access, or explore sample emails without connecting an account.
- **Learning Lab:** Experiment with temporary changes to an email and compare how those changes affect its classification.
- **Learning summaries:** Review educational explanations about suspicious patterns and safer ways to verify unexpected messages. Optional on-device AI can help generate guidance.
- **Saved learning sessions:** Revisit previous comparisons and use the available session-management tools.
- **Settings and Help Center:** Manage the Gmail connection, review application readiness, and find separate user guides and developer troubleshooting instructions.

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

## Learning Lab: Try a safe change

The Learning Lab lets users explore **how an email's wording, presentation, and sender information can affect the warning signs they notice**. Changes are applied only to a temporary learning copy; PhishLab does not edit or send the original email.

In **Try a safe change**, each of the 10 email components has three choices:

- **More suspicious:** Introduces a warning sign, such as urgency, an unfamiliar sender label, or a pushy request.
- **Neutral:** Uses more straightforward wording or presentation to compare with the original.
- **Less suspicious:** Uses calmer wording or clearer presentation to explore how the message might appear more trustworthy.

The components are **sender name, sender address, subject, greeting, body, request, link label, attachment filename, signature, and formatting**. Select a component and an example to review the original and modified values side by side. You can undo the selected change and try another option.

These labels describe the *intent of the example*, not a guarantee that a message is safe or that the classifier score will move in a particular direction. Link labels, attachment filenames, and signatures are **preview-only**: they help users recognize presentation cues but do not change classifier input or real email content.

### Learning summaries and on-device AI

After reviewing a comparison, users can read a learning summary about the detected indicators and what the example demonstrates. When the optional on-device writing assistant is available, it can generate neutral rewrites for the **subject, body, and request** and contribute to the educational guidance. Other examples use controlled, predefined wording.

AI-generated learning guidance is identified in the interface and may be incomplete. It is separate from the trained classifier's results and should not be treated as proof that an email is legitimate. For unexpected requests, verify information directly through a trusted service or contact method.

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
percentage points. Link labels, attachment names, and signatures are **preview-only learning fields**.
Their three example choices affect only `modified_values` in the temporary
comparison; no real links, attachments, Gmail messages, or classifier inputs
are changed. The other components also expose three directions: more
suspicious, neutral, and less suspicious. Only the neutral subject/body/request
rewrites use the optional local writing model; the remaining options are
controlled educational examples.

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

## Settings and Help Center

**Settings** provides Gmail account controls and a **Debugging** section for development and troubleshooting. The Debugging section includes application readiness, AI device information, local Qwen configuration, the **Force Qwen** preference for AI rewrites, and an optional Python test runner. These controls remain in Settings rather than appearing in the normal Learning Lab comparison.

The **Help Center** is organized into two tabs:

- **Help guides:** Instructions and FAQs for connecting Gmail, scanning the inbox, using the training demo, comparing learning examples, understanding results, managing sessions, and protecting account privacy.
- **Developer & debugging:** Local setup, backend/frontend commands, AI configuration, testing guidance, and troubleshooting for developers running the source version.

The dashboard's welcome message uses the connected account's **first name** when available.

### Optional local AI setup

PhishLab supports the **Qwen3 4B 4-bit (Q4_K_M)** local writing assistant. It is optional for normal training examples and is used for supported AI-assisted rewrites and learning guidance when configured. From the `backend` directory, the setup helper can be run with:

```powershell
python scripts/setup_local_ai.py
```

The model file is installed separately from the source code. The **Force Qwen** setting can require the AI writing assistant for supported rewrites rather than using prepared replacement text. If that mode is enabled and the model is unavailable, the AI rewrite may not complete; other educational examples remain available.

## Privacy and development notes

**Settings → Debugging** retains application readiness, Qwen3 4B Q4_K_M
configuration, and the optional local test runner. The Help Center has a
separate **Developer & debugging** tab with startup and test commands.

The `backend/model/email_classifier.pkl` classifier and the Qwen GGUF model
must be installed separately; they are not included in source-only ZIPs.
Keep `backend/credentials.json`, `backend/token.json`, `.local-ai-*.json`,
local databases, and trained model binaries out of public source archives.
