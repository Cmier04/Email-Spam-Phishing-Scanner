"""Check local history storage without exposing database credentials.

Run with PHISHLAB_DATABASE_URL set in the environment, from backend/:
    python scripts/check_history_storage.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.scan_history_service import history_status  # noqa: E402


def main() -> int:
    status = history_status()
    if not status["configured"]:
        print("History is not configured. Set PHISHLAB_DATABASE_URL first.")
        return 2
    if not status["available"]:
        print("History database cannot be reached or initialized; check local MySQL and SQLAlchemy/PyMySQL installation.")
        return 1
    print(f"History database ready ({status['backend']}); enabled={status['enabled']}, retention={status['retention_days']} days, records={status['entry_count']}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
