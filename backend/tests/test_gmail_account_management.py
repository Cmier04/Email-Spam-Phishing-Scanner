import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from fastapi import HTTPException
from starlette.requests import Request

from app.api.gmail import (
    connect_gmail,
    disconnect_gmail,
    gmail_connection_status,
    require_local_state_change,
)
from app.services import gmail_service
from app.services.gmail_service import (
    GmailAuthenticationError,
    GmailConfigurationError,
    connect_gmail_account,
    disconnect_gmail_account,
    get_gmail_connection_status,
    get_gmail_service,
)


class FakeCredentials:
    def __init__(self, *, valid=True, expired=False, refresh_token="refresh-token"):
        self.valid = valid
        self.expired = expired
        self.refresh_token = refresh_token
        self.refresh_calls = 0

    def refresh(self, _request):
        self.refresh_calls += 1
        self.expired = False
        self.valid = True

    def to_json(self):
        return '{"fake":"credentials"}'


class ImmediateThread:
    created = None

    def __init__(self, *, target, args, daemon, name):
        self.target = target
        self.args = args
        self.daemon = daemon
        self.name = name
        self.started = False
        ImmediateThread.created = self

    def start(self):
        self.started = True


class GmailAccountManagementTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        base = Path(self.temporary_directory.name)
        self.credentials_path = base / "credentials.json"
        self.token_path = base / "token.json"
        self.path_patches = [
            patch.object(gmail_service, "CREDENTIALS_PATH", self.credentials_path),
            patch.object(gmail_service, "TOKEN_PATH", self.token_path),
        ]
        for path_patch in self.path_patches:
            path_patch.start()
        gmail_service._connection_attempt_id = None
        gmail_service._connection_status.update(
            state="disconnected", connected=False, email=None, error=None
        )

    def tearDown(self):
        for path_patch in reversed(self.path_patches):
            path_patch.stop()
        self.temporary_directory.cleanup()

    def test_connected_status_includes_account_email(self):
        credentials = FakeCredentials()
        with (
            patch.object(gmail_service, "_load_existing_credentials", return_value=credentials),
            patch.object(gmail_service, "_build_gmail_service", return_value=object()),
            patch.object(
                gmail_service,
                "_get_account_email",
                return_value="learner@example.test",
            ),
        ):
            result = get_gmail_connection_status()

        self.assertTrue(result["connected"])
        self.assertEqual(result["state"], "connected")
        self.assertEqual(result["email"], "learner@example.test")

    def test_disconnected_status_does_not_start_oauth(self):
        with (
            patch.object(gmail_service, "_load_existing_credentials", return_value=None),
            patch.object(gmail_service, "_gmail_imports") as google_imports,
        ):
            result = get_gmail_connection_status()

        self.assertEqual(result["state"], "disconnected")
        self.assertFalse(result["connected"])
        google_imports.assert_not_called()

    def test_missing_client_credentials_are_reported_and_connect_is_rejected(self):
        with patch.object(gmail_service, "_load_existing_credentials", return_value=None):
            result = get_gmail_connection_status()

        self.assertFalse(result["credentials_configured"])
        with self.assertRaises(GmailConfigurationError):
            connect_gmail_account()

    def test_expired_credentials_are_refreshed_without_interactive_oauth(self):
        self.token_path.write_text("{}", encoding="utf-8")
        credentials = FakeCredentials(valid=False, expired=True)
        credentials_loader = Mock()
        credentials_loader.from_authorized_user_file.return_value = credentials
        google = {
            "RefreshError": RuntimeError,
            "Request": Mock(return_value=object()),
            "Credentials": credentials_loader,
        }

        with patch.object(gmail_service, "_gmail_imports", return_value=google):
            loaded = gmail_service._load_existing_credentials()

        self.assertIs(loaded, credentials)
        self.assertEqual(credentials.refresh_calls, 1)
        self.assertEqual(self.token_path.read_text(encoding="utf-8"), credentials.to_json())

    def test_message_service_never_starts_oauth_when_disconnected(self):
        with patch.object(gmail_service, "_load_existing_credentials", return_value=None):
            with self.assertRaisesRegex(GmailAuthenticationError, "Settings"):
                get_gmail_service()

    def test_connect_starts_background_oauth_and_returns_pending(self):
        self.credentials_path.write_text("{}", encoding="utf-8")
        with (
            patch.object(
                gmail_service,
                "get_gmail_connection_status",
                return_value={"connected": False, "state": "disconnected"},
            ),
            patch.object(gmail_service.threading, "Thread", ImmediateThread),
        ):
            result = connect_gmail_account()

        self.assertEqual(result["state"], "connecting")
        self.assertTrue(ImmediateThread.created.started)
        self.assertTrue(ImmediateThread.created.daemon)
        self.assertEqual(ImmediateThread.created.name, "gmail-oauth")

    def test_oauth_worker_records_success(self):
        credentials = FakeCredentials()
        flow = Mock()
        flow.run_local_server.return_value = credentials
        installed_flow = Mock()
        installed_flow.from_client_secrets_file.return_value = flow
        gmail_service._connection_attempt_id = "attempt"
        gmail_service._connection_status["state"] = "connecting"

        with (
            patch.object(
                gmail_service,
                "_gmail_imports",
                return_value={"InstalledAppFlow": installed_flow},
            ),
            patch.object(gmail_service, "_build_gmail_service", return_value=object()),
            patch.object(
                gmail_service, "_get_account_email", return_value="owner@example.test"
            ),
            patch.object(gmail_service, "_save_credentials") as save_credentials,
        ):
            gmail_service._complete_oauth_connection("attempt")

        save_credentials.assert_called_once_with(credentials)
        self.assertEqual(gmail_service._connection_status["state"], "connected")
        self.assertEqual(gmail_service._connection_status["email"], "owner@example.test")
        self.assertEqual(flow.run_local_server.call_args.kwargs["timeout_seconds"], 300)

    def test_oauth_worker_records_safe_failure(self):
        installed_flow = Mock()
        installed_flow.from_client_secrets_file.side_effect = ValueError("secret detail")
        gmail_service._connection_attempt_id = "attempt"
        gmail_service._connection_status["state"] = "connecting"

        with patch.object(
            gmail_service,
            "_gmail_imports",
            return_value={"InstalledAppFlow": installed_flow},
        ):
            gmail_service._complete_oauth_connection("attempt")

        self.assertEqual(gmail_service._connection_status["state"], "failed")
        self.assertNotIn("secret detail", gmail_service._connection_status["error"])

    def test_disconnect_removes_local_token_without_claiming_revocation(self):
        self.token_path.write_text("local token", encoding="utf-8")
        gmail_service._connection_status["state"] = "connected"

        result = disconnect_gmail_account()

        self.assertFalse(self.token_path.exists())
        self.assertEqual(result["state"], "disconnected")
        self.assertFalse(result["connected"])

    def test_api_functions_preserve_account_service_results(self):
        status_result = {
            "state": "connected",
            "connected": True,
            "email": "owner@example.test",
            "error": None,
            "credentials_configured": True,
        }
        with patch("app.api.gmail.get_gmail_connection_status", return_value=status_result):
            self.assertEqual(gmail_connection_status(), status_result)
        with patch("app.api.gmail.connect_gmail_account", return_value=status_result):
            self.assertEqual(connect_gmail(), status_result)
        with patch("app.api.gmail.disconnect_gmail_account", return_value=status_result):
            self.assertEqual(
                disconnect_gmail(),
                {**status_result, "google_permission_revoked": False},
            )

    def test_account_mutations_require_loopback_and_trusted_browser_origin(self):
        def request(client_host, origin=None):
            headers = []
            if origin:
                headers.append((b"origin", origin.encode("ascii")))
            return Request(
                {
                    "type": "http",
                    "method": "POST",
                    "path": "/api/gmail/connect",
                    "headers": headers,
                    "client": (client_host, 12345),
                    "server": ("127.0.0.1", 8000),
                    "scheme": "http",
                    "query_string": b"",
                }
            )

        require_local_state_change(
            request("127.0.0.1", "http://127.0.0.1:5173")
        )
        with self.assertRaises(HTTPException) as remote_error:
            require_local_state_change(request("192.0.2.10"))
        self.assertEqual(remote_error.exception.status_code, 403)

        with self.assertRaises(HTTPException) as origin_error:
            require_local_state_change(
                request("127.0.0.1", "https://attacker.example")
            )
        self.assertEqual(origin_error.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
