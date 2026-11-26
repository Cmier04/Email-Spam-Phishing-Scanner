"""OAuth Desktop client import must be opt-in, local, bounded, and token-free."""
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from app.main import app
from app.services import gmail_service
from app.services.gmail_service import GmailConfigurationError, configure_gmail_oauth_client

CLIENT = {
    "installed": {
        "client_id": "123456.apps.googleusercontent.com",
        "project_id": "example-project",
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "client_secret": "example-client-secret",
        "redirect_uris": ["http://localhost"]
    }
}

class OAuthClientSetupTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "config" / "credentials.json"
        self.token = Path(self.temp.name) / "token.json"
        for name, target in (("CREDENTIALS_PATH", self.path), ("TOKEN_PATH", self.token)):
            patcher = patch.object(gmail_service, name, target)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.original = gmail_service._connection_status.copy()
        self.addCleanup(lambda: gmail_service._connection_status.update(self.original))
        gmail_service._connection_status.update(state="disconnected", connected=False, email=None, error=None)
        self.client = TestClient(app, client=("127.0.0.1", 43121))
        self.remote = TestClient(app, client=("198.51.100.22", 43121))

    def test_valid_client_saves_owner_only_config_and_reports_ready(self):
        result = self.client.post("/api/gmail/oauth-client", json=CLIENT)
        self.assertEqual(result.status_code, 200, result.text)
        self.assertTrue(result.json()["credentials_configured"])
        self.assertEqual(json.loads(self.path.read_text()), CLIENT)
        self.assertFalse(self.token.exists())
        if os.name == "posix":
            self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)

    def test_rejects_user_token_and_web_oauth_client(self):
        for payload in ({"token": "123"}, {"web": CLIENT["installed"]}, {"installed": {"client_id": "bad"}}):
            response = self.client.post("/api/gmail/oauth-client", json=payload)
            self.assertEqual(response.status_code, 400, response.text)
            self.assertFalse(self.path.exists())

    def test_rejects_untrusted_google_auth_endpoints(self):
        payload = json.loads(json.dumps(CLIENT))
        payload["installed"]["token_uri"] = "https://attacker.example/token"
        with self.assertRaises(GmailConfigurationError):
            configure_gmail_oauth_client(payload)

    def test_rejects_remote_and_foreign_origin(self):
        self.assertEqual(self.remote.post("/api/gmail/oauth-client", json=CLIENT).status_code, 403)
        self.assertEqual(self.client.post("/api/gmail/oauth-client", json=CLIENT,
            headers={"Origin": "https://not-phishlab.example"}).status_code, 403)
        self.assertFalse(self.path.exists())

    def test_rejects_oversized_payload(self):
        oversized = {"installed": {"data": "x" * 30000}}
        response = self.client.post("/api/gmail/oauth-client", json=oversized)
        self.assertEqual(response.status_code, 413)
        self.assertFalse(self.path.exists())

    def test_rejects_import_with_existing_token(self):
        self.token.write_text("existing authorization")
        result = self.client.post("/api/gmail/oauth-client", json=CLIENT)
        self.assertEqual(result.status_code, 400)
        self.assertFalse(self.path.exists())

    def test_rejects_import_while_authorization_in_progress(self):
        gmail_service._connection_status["state"] = "connecting"
        result = self.client.post("/api/gmail/oauth-client", json=CLIENT)
        self.assertEqual(result.status_code, 400)
        self.assertFalse(self.path.exists())

if __name__ == "__main__":
    unittest.main()
