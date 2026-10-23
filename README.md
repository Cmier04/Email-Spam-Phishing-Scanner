# Email Spam/Phishing Scanner
A desktop application which classifies, notifies, and teaches users about spam and phishing emails using a machine learning model.

This repository houses the frontend/backend implementation and utilizes the machine learning model developed in a separate repo:  
>[Email Spam/Phishing Classifier](https://github.com/MW562/email_spam-phishing_classifier)

## Backend and Gmail setup

From `backend`, activate the virtual environment, install dependencies, and run the API:

```powershell
.\venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn app.main:app --reload
```

The existing classifier is available at `POST /api/classify`. Gmail scanning is
available at `GET /api/gmail/latest` and `GET /api/gmail/recent?limit=10`; the
recent-message limit must be between 1 and 50.

To configure Gmail OAuth:

1. Create or select a project in the [Google Cloud Console](https://console.cloud.google.com/).
2. Enable the Gmail API for that project.
3. In **Google Auth Platform > Branding**, configure the app name, support email,
   audience, and contact email. For an External testing app, add your Gmail account
   under **Audience > Test users**.
4. Under **Data Access**, add the Gmail read-only scope:
   `https://www.googleapis.com/auth/gmail.readonly`.
5. In **Google Auth Platform > Clients**, create an OAuth client with application
   type **Desktop app**.
6. Download its JSON file, rename it to `credentials.json`, and place it directly
   in `backend/`.
7. Call either Gmail endpoint. The first request opens a browser consent flow and
   then creates `backend/token.json`; later requests reuse or refresh that token.

Both OAuth files are ignored by Git and must never be committed. If the configured
scope changes, delete the local `token.json` and authorize again. See Google's
[Gmail Python quickstart](https://developers.google.com/workspace/gmail/api/quickstart/python)
for the current console workflow.

Run the backend unit tests from `backend` with:

```powershell
python -m unittest discover -s tests -v
```
