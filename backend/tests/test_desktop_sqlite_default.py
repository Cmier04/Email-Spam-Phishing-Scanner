"""Electron provisions a private SQLite database with no local database server."""
from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.services import scan_history_service as store

try:
    import sqlalchemy  # noqa: F401
    SQL_AVAILABLE = True
except ImportError:
    SQL_AVAILABLE = False


@unittest.skipUnless(SQL_AVAILABLE, "SQLAlchemy storage dependency not installed")
class DesktopSQLiteDefaultTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="phislab-desktop-")
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "Application Support" / "PhisLab?Test" / "data" / "history.db"
        self.env = patch.dict(os.environ, {
            "PHISHLAB_DATABASE_URL": "",
            "PHISHLAB_DESKTOP_SQLITE_PATH": str(self.path),
        })
        self.env.start()
        self.addCleanup(self.env.stop)
        self.addCleanup(store._database.cache_clear)

    def tearDown(self):
        try:
            store._get_database()[0].dispose()
        except store.HistoryUnavailable:
            pass

    def test_first_launch_creates_sqlite_file_and_private_permissions(self):
        status = store.history_status()
        self.assertEqual(status["backend"], "sqlite")
        self.assertTrue(status["configured"])
        self.assertTrue(status["available"])
        self.assertFalse(status["enabled"])  # Consent remains opt-in.
        self.assertTrue(self.path.exists())
        if os.name == "posix":
            self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)

    def test_history_survives_service_reinitialization(self):
        store.update_history_settings(enabled=True, retention_days=90)
        row = {"id": "demo-123", "sender_name": "Mail sender", "subject": "Example",
               "classification": "Potential threat", "confidence": 92.0,
               "malicious_probability": 92.0}
        self.assertEqual(store.record_scans([row], "demo"), 1)
        store._get_database()[0].dispose()
        store._database.cache_clear()
        status = store.history_status()
        self.assertTrue(status["enabled"])
        self.assertEqual(status["entry_count"], 1)
        self.assertEqual(store.list_history()["items"][0]["subject"], "Example")

    def test_explicit_mysql_overrides_desktop_sqlite(self):
        with patch.dict(os.environ, {"PHISHLAB_DATABASE_URL": "mysql+pymysql://phislab@localhost:3306/phislab"}):
            self.assertEqual(store._backend_name(store._database_url()), "mysql")
        self.assertEqual(store._backend_name(store._database_url()), "sqlite")


if __name__ == "__main__":
    unittest.main()
