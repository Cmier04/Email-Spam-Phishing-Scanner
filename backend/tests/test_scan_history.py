"""Scan history database/privacy regression tests, using isolated SQLite fixtures."""

import os
import tempfile
import unittest
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

try:
    import sqlalchemy
    SQL_AVAILABLE = True
except ImportError:
    SQL_AVAILABLE = False

from fastapi.testclient import TestClient
from app.main import app
from app.services import scan_history_service as store


def fake_scan(message_id="demo-123"):
    return {
        "id": message_id, "sender": "Example Team", "subject": "Please review the invoice",
        "classification": "Potential threat", "confidence": 89.0,
        "malicious_probability": 89.0,
        "body": "SECRET BODY CONTENT NOT FOR DATABASE", "links": [{"url": "https://secret.example", "display_text": "Example"}],
        "thread_id": "test-thread", "recipient": "test@example.com", "date": "2026-11-25", "snippet": "Preview",
        "token": "PRIVATE OAUTH TOKEN",
    }


@unittest.skipUnless(SQL_AVAILABLE, "Optional SQLAlchemy storage dependency not installed")
class ScanHistoryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.env_patch = patch.dict(os.environ, {
            "PHISHLAB_DATABASE_URL": f"sqlite:///{Path(self.tmp.name) / 'history.db'}"
        })
        self.env_patch.start()
        self.addCleanup(self.env_patch.stop)
        self.client = TestClient(app, client=("127.0.0.1", 53221))
        self.remote = TestClient(app, client=("192.0.2.5", 50000))
        self.addCleanup(store._database.cache_clear)
        def dispose_engines():
            try:
                store._get_database()[0].dispose()
            except store.HistoryUnavailable:
                pass
        self.addCleanup(dispose_engines)

    def test_collection_disabled_by_default_and_no_private_content(self):
        self.assertFalse(store.history_status()["enabled"])
        self.assertEqual(store.record_scans([fake_scan()], "demo"), 0)
        store.update_history_settings(enabled=True, retention_days=30)
        self.assertEqual(store.record_scans([fake_scan()], "demo"), 1)
        item = store.list_history()["items"][0]
        self.assertEqual(item["subject"], "Please review the invoice")
        self.assertNotIn("id_hash", item)
        self.assertNotIn("body", item)
        self.assertNotIn("links", item)
        self.assertNotIn("token", item)
        file_bytes = (Path(self.tmp.name) / "history.db").read_bytes()
        self.assertNotIn(b"SECRET BODY CONTENT", file_bytes)
        self.assertNotIn(b"PRIVATE OAUTH TOKEN", file_bytes)
        self.assertNotIn(b"https://secret.example", file_bytes)
        self.assertNotIn(b"demo-123", file_bytes)

    def test_upsert_prevents_duplicates_and_keeps_feedback(self):
        store.update_history_settings(enabled=True, retention_days=90)
        store.record_scans([fake_scan()], "demo")
        first = store.list_history()["items"][0]
        store.save_feedback(first["id"], "correct", "Reviewed")
        store.record_scans([fake_scan()], "demo")
        data = store.list_history()
        self.assertEqual(data["total"], 1)
        self.assertEqual(data["items"][0]["scan_count"], 2)
        self.assertEqual(data["items"][0]["feedback_verdict"], "correct")

    def test_feedback_update_and_delete_cascade(self):
        store.update_history_settings(enabled=True, retention_days=90)
        store.record_scans([fake_scan()], "gmail")
        scan_id = store.list_history()["items"][0]["id"]
        store.save_feedback(scan_id, "incorrect", "Needs checking")
        store.save_feedback(scan_id, "unsure", "Unknown")
        self.assertEqual(store.list_history()["items"][0]["feedback_note"], "Unknown")
        store.delete_scan(scan_id)
        self.assertEqual(store.list_history()["total"], 0)
        with self.assertRaises(store.HistoryNotFound):
            store.save_feedback(scan_id, "correct", "")

    def test_retention_purges_history_and_feedback(self):
        from sqlalchemy import update, select, func
        store.update_history_settings(enabled=True, retention_days=30)
        store.record_scans([fake_scan()], "demo")
        scan_id = store.list_history()["items"][0]["id"]
        store.save_feedback(scan_id, "correct", "old")
        engine, _settings, scans, feedback = store._get_database()
        with engine.begin() as conn:
            conn.execute(update(scans).values(last_scanned_at=store._utcnow() - timedelta(days=31)))
        self.assertEqual(store.list_history()["total"], 0)
        with engine.connect() as conn:
            self.assertEqual(conn.execute(select(func.count()).select_from(feedback)).scalar_one(), 0)

    def test_disable_maintains_existing_records_and_clear_deletes(self):
        store.update_history_settings(enabled=True, retention_days=90)
        store.record_scans([fake_scan()], "demo")
        store.update_history_settings(enabled=False, retention_days=90)
        self.assertEqual(store.record_scans([fake_scan("different")], "demo"), 0)
        self.assertEqual(store.list_history()["total"], 1)
        store.clear_history()
        self.assertEqual(store.list_history()["total"], 0)

    def test_local_api_settings_history_feedback_deletion(self):
        before = self.client.get("/api/history/status")
        self.assertEqual(before.status_code, 200)
        self.assertFalse(before.json()["enabled"])
        changed = self.client.put("/api/history/settings", json={"enabled": True, "retention_days": 30})
        self.assertEqual(changed.status_code, 200, changed.text)
        store.record_scans([fake_scan()], "demo")
        result = self.client.get("/api/history/scans")
        self.assertEqual(result.status_code, 200)
        scan_id = result.json()["items"][0]["id"]
        voted = self.client.put(f"/api/history/scans/{scan_id}/feedback", json={"verdict": "incorrect", "note": "Wrong label"})
        self.assertEqual(voted.status_code, 200)
        self.assertEqual(self.client.get("/api/history/scans").json()["items"][0]["feedback_verdict"], "incorrect")
        self.assertEqual(self.client.delete(f"/api/history/scans/{scan_id}").status_code, 200)
        self.assertEqual(self.client.get("/api/history/scans").json()["total"], 0)

    def test_api_rejects_bad_values(self):
        self.assertEqual(self.client.put("/api/history/settings", json={"enabled": True, "retention_days": 17}).status_code, 422)
        self.assertEqual(self.client.get("/api/history/scans?limit=100000").status_code, 422)
        self.assertEqual(self.client.put("/api/history/scans/4/feedback", json={"verdict": "attack"}).status_code, 422)
        self.assertEqual(self.client.put("/api/history/scans/4/feedback", json={"verdict": "correct", "note": "x"*501}).status_code, 422)
        self.assertEqual(self.client.put("/api/history/scans/4/feedback", json={"verdict": "correct"}).status_code, 404)

    def test_private_history_routes_reject_remote_and_cross_origin(self):
        for path in ("/api/history/status", "/api/history/scans"):
            self.assertEqual(self.remote.get(path).status_code, 403)
            self.assertEqual(self.client.get(path, headers={"Origin": "https://evil.example"}).status_code, 403)
        self.assertEqual(self.remote.delete("/api/history/scans").status_code, 403)
        self.assertEqual(self.client.put("/api/history/settings", headers={"Origin": "https://evil.example"},
                                         json={"enabled": True, "retention_days": 90}).status_code, 403)

    def test_db_failure_reports_unavailable_and_does_not_expose_password(self):
        with patch.dict(os.environ, {"PHISHLAB_DATABASE_URL": "mysql+pymysql://secret:private@127.0.0.1:65000/phislab"}):
            status = self.client.get("/api/history/status")
            self.assertEqual(status.status_code, 200)
            self.assertTrue(status.json()["configured"])
            self.assertFalse(status.json()["available"])
            failure = self.client.get("/api/history/scans")
            self.assertEqual(failure.status_code, 503)
            self.assertNotIn("secret", failure.text)
            self.assertNotIn("private", failure.text)

    def test_demo_api_records_results_only_after_opt_in(self):
        from app.services import demo_email_service
        with patch.object(demo_email_service, "classify_email_detailed", return_value={
            "classification": "Legitimate", "confidence": 91.0,
            "malicious_probability": 9.0,
        }):
            self.assertEqual(self.client.get("/api/demo/emails").status_code, 200)
            self.assertEqual(store.list_history()["total"], 0)
            store.update_history_settings(enabled=True, retention_days=90)
            self.assertEqual(self.client.get("/api/demo/emails").status_code, 200)
            self.assertEqual(store.list_history()["total"], 2)
            self.assertEqual(self.client.get("/api/demo/emails").status_code, 200)
            self.assertEqual(store.list_history()["total"], 2)
            self.assertEqual(store.list_history()["items"][0]["scan_count"], 2)

    def test_sqlite_metadata_file_is_private_when_supported(self):
        if os.name != "posix":
            self.skipTest("POSIX permissions only")
        store.history_status()
        self.assertEqual((Path(self.tmp.name) / "history.db").stat().st_mode & 0o777, 0o600)

    def test_classification_route_remains_available_when_history_is_unconfigured(self):
        from app.api import gmail as gmail_api
        with patch.dict(os.environ, {"PHISHLAB_DATABASE_URL": ""}):
            with patch.object(gmail_api, "scan_recent_messages", return_value=[fake_scan("gmail-xyz")]):
                result = self.client.get("/api/gmail/recent")
        self.assertEqual(result.status_code, 200, result.text)


if __name__ == "__main__":
    unittest.main()
