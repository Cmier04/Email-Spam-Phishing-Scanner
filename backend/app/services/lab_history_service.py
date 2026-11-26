"""Opt-in, local Learning Lab drafts. Saved text remains on the user's disk.

A draft holds a training copy of the original email, the current changes,
validated classifier output and educational summary so it can be resumed.
It never stores Gmail OAuth credentials or link metadata. Because a lab
needs to resume an email, the local snapshot contains its message ID and
text, including any URLs already embedded in that text.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone, timedelta
from functools import lru_cache
from typing import Any

from app.services.scan_history_service import (
    HistoryUnavailable, HistoryNotFound, _get_database, _config, _safe_call,
    _utcnow,
)

_EMAIL_FIELDS = frozenset({
    'id', 'source', 'sender', 'email', 'initials', 'tone', 'subject',
    'preview', 'time', 'received_at', 'classification', 'confidence',
    'maliciousProbability', 'risk', 'threat_category', 'greeting',
    'body', 'request', 'actionLabel', 'attachment', 'signature',
})
_RESULT_FIELDS = frozenset({
    'email_id', 'ai_mode', 'source', 'original_classification',
    'original_confidence', 'original_malicious_probability',
    'modified_classification', 'modified_confidence',
    'modified_malicious_probability', 'score_change', 'decision_changed',
    'applied_transformations', 'modified_subject', 'modified_body',
    'modified_values', 'warnings', 'learning_summary',
})
_MAX_SIZE = 140_000


@lru_cache(maxsize=4)
def _table(url: str):
    from sqlalchemy import Table, MetaData, Column, Integer, String, DateTime, Text, UniqueConstraint
    from app.services.scan_history_service import _database
    engine = _database(url)[0]
    meta = MetaData()
    labs = Table(
        'phislab_lab_sessions', meta,
        Column('id', Integer, primary_key=True, autoincrement=True),
        Column('source', String(12), nullable=False),
        Column('message_hash', String(64), nullable=False),
        Column('subject', String(500), nullable=False),
        Column('sender', String(255), nullable=False),
        Column('snapshot_json', Text, nullable=False),
        Column('revision', Integer, nullable=False, default=1),
        Column('updated_at', DateTime, nullable=False),
        UniqueConstraint('source', 'message_hash', name='uq_phislab_lab_email'),
    )
    try:
        meta.create_all(engine, tables=[labs])
    except Exception as exc:
        raise HistoryUnavailable('Lab history could not be initialized.') from exc
    return labs


def _database_and_lab():
    from app.services.scan_history_service import _database_url
    url = _database_url()
    engine, settings, scans, feedback = _get_database()
    return engine, settings, _table(url)


def _payload_for_storage(raw: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    if not isinstance(raw, dict):
        raise ValueError('Invalid lab session.')
    email = raw.get('email')
    result = raw.get('experiment')
    changes = raw.get('changes')
    if not isinstance(email, dict) or not isinstance(result, dict) or not isinstance(changes, list):
        raise ValueError('Lab session must include email, experiment and changes.')
    source = email.get('source')
    identifier = email.get('id')
    if source not in ('demo', 'gmail') or not isinstance(identifier, str) or not 1 <= len(identifier) <= 256:
        raise ValueError('Invalid source email.')
    if len(changes) > 10 or not all(isinstance(change, dict) and
       change.get('part') in ('senderName','senderAddress','subject','greeting','body','request','link','attachment','signature','formatting') and
       isinstance(change.get('id'), str) and len(change['id']) <= 100 for change in changes):
        raise ValueError('Invalid lab transformations.')
    if result.get('email_id') != identifier or result.get('source') != source:
        raise ValueError('The experiment does not match this email.')
    safe_email = {key: value for key, value in email.items() if key in _EMAIL_FIELDS and
                  (isinstance(value, (str, int, float)) or value is None)}
    safe_result = {key: value for key, value in result.items() if key in _RESULT_FIELDS}
    # Store only transformation IDs and the authored result, never arbitrary
    # client metadata, OAuth credentials, or email hyperlink targets.
    snapshot = {'email': safe_email,
                'changes': [{'part': change['part'], 'id': change['id']} for change in changes],
                'experiment': safe_result,
                'selected_part': raw.get('selected_part') if raw.get('selected_part') in ('subject','greeting','body','request','senderName','senderAddress','link','attachment','signature','formatting') else 'subject'}
    serialized = json.dumps(snapshot, ensure_ascii=False, separators=(',', ':'))
    if len(serialized.encode('utf-8')) > _MAX_SIZE:
        raise ValueError('Lab session is too large to save.')
    return hashlib.sha256(f'{source}\0{identifier}'.encode('utf-8')).hexdigest(), snapshot


def save_lab_session(raw: dict[str, Any]) -> dict:
    message_hash, snapshot = _payload_for_storage(raw)
    email = snapshot['email']
    source = email['source']

    def write():
        from sqlalchemy import insert, select, update, delete
        engine, settings, table = _database_and_lab()
        with engine.begin() as conn:
            config = _config(conn, settings)
            if not config['enabled']:
                raise ValueError('Enable Save Lab history in Settings → Data and privacy first.')
            conn.execute(delete(table).where(table.c.updated_at < _utcnow() - timedelta(days=config['retention_days'])))
            previous = conn.execute(select(table.c.id, table.c.revision).where(
                (table.c.source == source) & (table.c.message_hash == message_hash))).first()
            values = {'subject': str(email.get('subject') or '')[:500],
                      'sender': str(email.get('sender') or '')[:255],
                      'snapshot_json': json.dumps(snapshot, ensure_ascii=False), 'updated_at': _utcnow()}
            if previous:
                conn.execute(update(table).where(table.c.id == previous.id).values(
                    **values, revision=previous.revision+1))
                session_id = previous.id
            else:
                session_id = conn.execute(insert(table).values(
                    source=source, message_hash=message_hash, revision=1, **values)).inserted_primary_key[0]
        return {'saved': True, 'id': int(session_id)}

    return _safe_call(write)


def list_lab_sessions(limit: int = 40, offset: int = 0) -> dict:
    if not 1 <= limit <= 100 or not 0 <= offset <= 10_000:
        raise ValueError('Invalid pagination.')
    def read():
        from sqlalchemy import select, func, delete
        engine, settings, table = _database_and_lab()
        with engine.begin() as conn:
            config = _config(conn, settings)
            conn.execute(delete(table).where(table.c.updated_at < _utcnow() - timedelta(days=config['retention_days'])))
            total = conn.execute(select(func.count()).select_from(table)).scalar_one()
            rows = conn.execute(select(table.c.id, table.c.source, table.c.subject, table.c.sender,
                table.c.updated_at, table.c.revision).order_by(table.c.updated_at.desc(), table.c.id.desc())
                .limit(limit).offset(offset)).mappings().all()
            return {'total': int(total), 'items': [
                {'id': int(row['id']), 'source': row['source'], 'subject': row['subject'],
                 'sender': row['sender'], 'revision': row['revision'],
                 'updated_at': row['updated_at'].isoformat()+'Z'} for row in rows]}
    return _safe_call(read)


def get_lab_session(session_id: int) -> dict:
    def read():
        from sqlalchemy import select
        engine, settings, table = _database_and_lab()
        with engine.begin() as conn:
            row = conn.execute(select(table).where(table.c.id == session_id)).mappings().first()
            if row is None:
                raise HistoryNotFound('Lab history entry not found.')
            return {'id': session_id, 'revision': row['revision'],
                    'updated_at': row['updated_at'].isoformat()+'Z',
                    'snapshot': json.loads(row['snapshot_json'])}
    return _safe_call(read)


def delete_lab_session(session_id: int) -> dict:
    def remove():
        from sqlalchemy import delete
        engine, settings, table = _database_and_lab()
        with engine.begin() as conn:
            result = conn.execute(delete(table).where(table.c.id == session_id))
            if result.rowcount == 0:
                raise HistoryNotFound('Lab history entry not found.')
        return {'deleted': True}
    return _safe_call(remove)


def clear_lab_sessions() -> None:
    from sqlalchemy import delete
    engine, settings, table = _database_and_lab()
    with engine.begin() as conn:
        conn.execute(delete(table))
