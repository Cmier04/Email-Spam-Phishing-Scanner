"""Opt-in local scan history: metadata only, using MySQL or local SQLite.

A failed database must never make an email scan fail. Callers of record_scans
handle HistoryUnavailable separately. No raw body, OAuth token, URL, or
attachment contents are ever stored.
"""

from __future__ import annotations

import hashlib
import logging
import os
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable

LOGGER = logging.getLogger(__name__)
RETENTION_VALUES = frozenset({30, 90, 365})


class HistoryUnavailable(RuntimeError):
    pass


class HistoryNotFound(LookupError):
    pass


def _database_url() -> str:
    explicit = os.environ.get("PHISHLAB_DATABASE_URL", "").strip()
    if explicit:
        return explicit
    # Electron provides a raw filesystem path for safe handling of spaces,
    # question marks and other characters that have meaning in database URLs.
    desktop_path = os.environ.get("PHISHLAB_DESKTOP_SQLITE_PATH", "").strip()
    if desktop_path:
        return f"sqlite:///{desktop_path}"
    return ""


def _backend_name(url: str) -> str | None:
    if url.startswith("mysql+pymysql://"):
        return "mysql"
    if url.startswith("sqlite:///"):
        return "sqlite"
    return None


@lru_cache(maxsize=4)
def _database(url: str):
    # SQLAlchemy and PyMySQL are optional dependencies; they are not imported
    # during normal app startup when history is unconfigured.
    from sqlalchemy import (Boolean, Column, DateTime, Float, ForeignKey,
                            Index, Integer, MetaData, String, Table,
                            UniqueConstraint, create_engine, insert)
    from sqlalchemy.engine import URL, make_url

    backend = _backend_name(url)
    if backend is None:
        raise HistoryUnavailable("History requires a supported local database URL.")
    desktop_path = os.environ.get("PHISHLAB_DESKTOP_SQLITE_PATH", "").strip()
    explicit_url = os.environ.get("PHISHLAB_DATABASE_URL", "").strip()
    if backend == "sqlite" and desktop_path and not explicit_url:
        desktop_file = Path(desktop_path).expanduser()
        if not desktop_file.is_absolute():
            raise HistoryUnavailable("Desktop SQLite storage must use an absolute path.")
        desktop_file = desktop_file.resolve()
        parsed = URL.create("sqlite", database=str(desktop_file))
    else:
        parsed = make_url(url)
    kwargs = {"pool_pre_ping": True, "hide_parameters": True}
    if backend == "mysql":
        if parsed.host not in ("localhost", "127.0.0.1", "::1") and os.environ.get("PHISHLAB_ALLOW_REMOTE_DATABASE") != "1":
            raise HistoryUnavailable("History requires a local MySQL server unless remote database access is explicitly allowed.")
        kwargs["connect_args"] = {"connect_timeout": 3, "read_timeout": 5, "write_timeout": 5}
    else:
        if parsed.database not in (None, "", ":memory:"):
            target = Path(parsed.database)
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        kwargs["connect_args"] = {"timeout": 5, "check_same_thread": False}
    engine = create_engine(parsed, **kwargs)
    meta = MetaData()
    settings = Table(
        "phislab_history_settings", meta,
        Column("setting_id", Integer, primary_key=True),
        Column("enabled", Boolean, nullable=False, default=False),
        Column("retention_days", Integer, nullable=False, default=90),
    )
    scans = Table(
        "phislab_scan_history", meta,
        Column("id", Integer, primary_key=True, autoincrement=True),
        Column("source", String(12), nullable=False),
        Column("message_hash", String(64), nullable=False),
        Column("sender", String(255), nullable=False),
        Column("subject", String(500), nullable=False),
        Column("classification", String(50), nullable=False),
        Column("confidence", Float, nullable=False),
        Column("malicious_probability", Float, nullable=False),
        Column("first_scanned_at", DateTime, nullable=False),
        Column("last_scanned_at", DateTime, nullable=False),
        Column("scan_count", Integer, nullable=False, default=1),
        UniqueConstraint("source", "message_hash", name="uq_phislab_message"),
        Index("ix_phislab_history_recent", "last_scanned_at"),
    )
    feedback = Table(
        "phislab_scan_feedback", meta,
        Column("scan_id", Integer, ForeignKey("phislab_scan_history.id", ondelete="CASCADE"), primary_key=True),
        Column("verdict", String(16), nullable=False),
        Column("note", String(500), nullable=False, default=""),
        Column("updated_at", DateTime, nullable=False),
    )
    try:
        meta.create_all(engine)
        with engine.begin() as conn:
            if conn.execute(settings.select().where(settings.c.setting_id == 1)).first() is None:
                conn.execute(insert(settings).values(setting_id=1, enabled=False, retention_days=90))
    except Exception as exc:
        engine.dispose()
        raise HistoryUnavailable("History database could not be initialized.") from exc
    # SQLite stores personal subject/sender metadata. Protect its file on POSIX.
    if backend == "sqlite" and parsed.database not in (None, "", ":memory:") and os.name == "posix":
        try:
            os.chmod(parsed.database, 0o600)
        except OSError as exc:
            engine.dispose()
            raise HistoryUnavailable("Could not secure the local scan history file.") from exc
    return engine, settings, scans, feedback


def _get_database():
    url = _database_url()
    if not url:
        raise HistoryUnavailable("Scan history is not configured. Set PHISHLAB_DATABASE_URL.")
    if not _backend_name(url):
        raise HistoryUnavailable("History requires a supported local database URL.")
    try:
        return _database(url)
    except HistoryUnavailable:
        raise
    except Exception as exc:
        raise HistoryUnavailable("History database is unavailable. Check the local database configuration.") from exc


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _prune(conn, scans, feedback, days: int) -> None:
    from sqlalchemy import delete, select
    cutoff = _utcnow() - timedelta(days=days)
    expired = select(scans.c.id).where(scans.c.last_scanned_at < cutoff)
    conn.execute(delete(feedback).where(feedback.c.scan_id.in_(expired)))
    conn.execute(delete(scans).where(scans.c.last_scanned_at < cutoff))


def _config(conn, settings) -> dict:
    row = conn.execute(settings.select().where(settings.c.setting_id == 1)).mappings().one()
    return {"enabled": bool(row["enabled"]), "retention_days": int(row["retention_days"])}


def _safe_call(operation):
    try:
        return operation()
    except (HistoryUnavailable, HistoryNotFound, ValueError):
        raise
    except Exception as exc:
        LOGGER.warning("Local history database operation failed: %s", type(exc).__name__)
        raise HistoryUnavailable("Scan history database is unavailable. Check your local database connection.") from exc


def history_status() -> dict:
    url = _database_url()
    backend = _backend_name(url)
    initial = {"configured": bool(url), "available": False, "backend": backend,
               "enabled": False, "retention_days": 90, "entry_count": 0}
    if not url or backend is None:
        return initial

    def read():
        from sqlalchemy import func, select
        engine, settings, scans, feedback = _get_database()
        with engine.begin() as conn:
            config = _config(conn, settings)
            _prune(conn, scans, feedback, config["retention_days"])
            count = conn.execute(select(func.count()).select_from(scans)).scalar_one()
        return {**initial, "available": True, "entry_count": int(count), **config}

    try:
        return _safe_call(read)
    except HistoryUnavailable:
        return initial


def update_history_settings(*, enabled: bool, retention_days: int) -> dict:
    if type(enabled) is not bool or retention_days not in RETENTION_VALUES:
        raise ValueError("Invalid history settings.")

    def update():
        from sqlalchemy import update
        engine, settings, scans, feedback = _get_database()
        with engine.begin() as conn:
            conn.execute(update(settings).where(settings.c.setting_id == 1).values(
                enabled=enabled, retention_days=retention_days))
            _prune(conn, scans, feedback, retention_days)
        return history_status()

    return _safe_call(update)


def _normalize_scan(record: dict, source: str):
    identifier = str(record.get("id", ""))
    if not identifier or source not in ("gmail", "demo"):
        return None
    classification = record.get("classification")
    confidence = record.get("confidence")
    if classification not in ("Legitimate", "Potential threat"):
        return None
    if not isinstance(confidence, (int, float)) or not 0 <= confidence <= 100:
        return None
    malicious = record.get("malicious_probability")
    if not isinstance(malicious, (int, float)) or not 0 <= malicious <= 100:
        malicious = confidence if classification == "Potential threat" else 100 - confidence
    sender = str(record.get("sender_name") or record.get("sender") or "")[:255]
    return {"source": source,
            "message_hash": hashlib.sha256(f"{source}\0{identifier}".encode("utf-8")).hexdigest(),
            "sender": sender,
            "subject": str(record.get("subject") or "")[:500],
            "classification": classification,
            "confidence": float(confidence),
            "malicious_probability": float(malicious)}


def record_scans(records: Iterable[dict], source: str) -> int:
    """Store scan metadata only if a user explicitly enabled history.

    Upsert by opaque message hash so refreshing the inbox does not duplicate it.
    The caller handles HistoryUnavailable without interrupting classification.
    """
    if not _database_url():
        return 0  # History is optional; do not treat ordinary first-run scans as errors.

    def write():
        from sqlalchemy import and_, insert, select, update
        engine, settings, scans, feedback = _get_database()
        saved = 0
        with engine.begin() as conn:
            config = _config(conn, settings)
            if not config["enabled"]:
                return 0
            _prune(conn, scans, feedback, config["retention_days"])
            for record in records:
                values = _normalize_scan(record, source)
                if values is None:
                    continue
                existing = conn.execute(select(scans.c.id, scans.c.scan_count).where(and_(
                    scans.c.source == source, scans.c.message_hash == values["message_hash"]))).first()
                now = _utcnow()
                if existing:
                    conn.execute(update(scans).where(scans.c.id == existing.id).values(
                        **values, last_scanned_at=now, scan_count=existing.scan_count + 1))
                else:
                    conn.execute(insert(scans).values(
                        **values, first_scanned_at=now, last_scanned_at=now, scan_count=1))
                saved += 1
        return saved

    return _safe_call(write)


def _iso(value: datetime) -> str:
    return value.isoformat(timespec="seconds") + "Z"


def _row_dict(row) -> dict:
    m = row._mapping
    return {"id": int(m["id"]), "source": m["source"], "sender": m["sender"],
            "subject": m["subject"], "classification": m["classification"],
            "confidence": float(m["confidence"]),
            "malicious_probability": float(m["malicious_probability"]),
            "scan_count": int(m["scan_count"]),
            "first_scanned_at": _iso(m["first_scanned_at"]),
            "last_scanned_at": _iso(m["last_scanned_at"]),
            "feedback_verdict": m["verdict"],
            "feedback_note": m["note"] or ""}


def list_history(*, limit: int = 50, offset: int = 0) -> dict:
    if not 1 <= limit <= 100 or not 0 <= offset <= 10000:
        raise ValueError("Invalid pagination.")

    def read():
        from sqlalchemy import func, select
        engine, settings, scans, feedback = _get_database()
        with engine.begin() as conn:
            _prune(conn, scans, feedback, _config(conn, settings)["retention_days"])
            total = conn.execute(select(func.count()).select_from(scans)).scalar_one()
            query = (select(scans, feedback.c.verdict, feedback.c.note)
                     .select_from(scans.outerjoin(feedback, scans.c.id == feedback.c.scan_id))
                     .order_by(scans.c.last_scanned_at.desc(), scans.c.id.desc())
                     .limit(limit).offset(offset))
            items = [_row_dict(row) for row in conn.execute(query)]
        return {"items": items, "total": int(total)}

    return _safe_call(read)


def save_feedback(scan_id: int, verdict: str, note: str) -> dict:
    if verdict not in ("correct", "incorrect", "unsure") or len(note) > 500:
        raise ValueError("Invalid feedback.")

    def write():
        from sqlalchemy import insert, select, update
        engine, settings, scans, feedback = _get_database()
        with engine.begin() as conn:
            _prune(conn, scans, feedback, _config(conn, settings)["retention_days"])
            if conn.execute(select(scans.c.id).where(scans.c.id == scan_id)).first() is None:
                raise HistoryNotFound("History record does not exist.")
            if conn.execute(select(feedback.c.scan_id).where(feedback.c.scan_id == scan_id)).first():
                conn.execute(update(feedback).where(feedback.c.scan_id == scan_id).values(
                    verdict=verdict, note=note, updated_at=_utcnow()))
            else:
                conn.execute(insert(feedback).values(
                    scan_id=scan_id, verdict=verdict, note=note, updated_at=_utcnow()))
        return {"saved": True, "scan_id": scan_id}

    return _safe_call(write)


def delete_scan(scan_id: int) -> dict:
    def remove():
        from sqlalchemy import delete
        engine, settings, scans, feedback = _get_database()
        with engine.begin() as conn:
            conn.execute(delete(feedback).where(feedback.c.scan_id == scan_id))
            result = conn.execute(delete(scans).where(scans.c.id == scan_id))
            if not result.rowcount:
                raise HistoryNotFound("History record does not exist.")
        return {"deleted": True}

    return _safe_call(remove)


def clear_history() -> dict:
    def remove():
        from sqlalchemy import delete
        engine, settings, scans, feedback = _get_database()
        with engine.begin() as conn:
            conn.execute(delete(feedback))
            conn.execute(delete(scans))
        return {"deleted": True}

    return _safe_call(remove)



def save_feedback_for_email(source: str, email_id: str, verdict: str, note: str) -> dict:
    """Resolve an existing scan by its opaque ID hash, not a mutable subject."""
    if source not in ('gmail', 'demo') or not email_id or len(email_id) > 256:
        raise ValueError('Invalid email identity.')
    if verdict not in ('correct', 'incorrect', 'unsure') or len(note) > 500:
        raise ValueError('Invalid feedback.')
    message_hash = hashlib.sha256(f'{source}\0{email_id}'.encode('utf-8')).hexdigest()
    def lookup():
        from sqlalchemy import select
        engine, settings, scans, feedback = _get_database()
        with engine.begin() as conn:
            record = conn.execute(select(scans.c.id).where(
                (scans.c.source == source) & (scans.c.message_hash == message_hash))).first()
            if not record:
                raise HistoryNotFound('No stored scan for this email. Enable Save Lab history and rescan it.')
            return int(record.id)
    scan_id = _safe_call(lookup)
    return save_feedback(scan_id, verdict, note)
