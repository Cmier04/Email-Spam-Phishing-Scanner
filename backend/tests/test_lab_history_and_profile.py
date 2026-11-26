"""Lab drafts, exact feedback lookup and Google profile privacy tests."""
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from app.main import app
from app.services import scan_history_service as scans, lab_history_service as labs, gmail_service

try:
    import sqlalchemy
    HAS_SQL = True
except ImportError:
    HAS_SQL = False


@unittest.skipUnless(HAS_SQL, 'History tests require SQLAlchemy')
class LabHistoryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.env = patch.dict(os.environ, {'PHISHLAB_DATABASE_URL': f'sqlite:///{Path(self.temporary.name)/"history.db"}'})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.client = TestClient(app, client=('127.0.0.1', 12342))
        self.remote = TestClient(app, client=('192.0.2.12', 12342))
        self.addCleanup(scans._database.cache_clear)
        self.addCleanup(labs._table.cache_clear)
        self.addCleanup(lambda: scans._get_database()[0].dispose())
        self.snapshot = {
            'email': {'id': 'demo-abc', 'source': 'demo', 'sender': 'Example', 'subject': 'Account notice',
                      'body': 'Training copy: no links', 'classification': 'Potential threat',
                      'confidence': 85, 'tone': 'red', 'initials': 'E', 'risk': 'High',
                      'token': 'DO NOT STORE ME', 'links': [{'url': 'https://example.invalid'}]},
            'changes': [{'part': 'subject', 'id': 'neutral-subject'}],
            'experiment': {'email_id': 'demo-abc', 'source': 'demo',
                           'modified_subject': 'Account information', 'modified_body': 'Training copy: no links',
                           'learning_summary': {'why_it_mattered': 'Less urgency', 'what_you_should_learn': 'Check before acting'},
                           'private_key': 'DO NOT STORE ME'},
            'selected_part': 'subject'
        }

    def test_lab_history_requires_opt_in_and_round_trips(self):
        blocked = self.client.put('/api/history/labs', json=self.snapshot)
        self.assertEqual(blocked.status_code, 422, blocked.text)
        self.client.put('/api/history/settings', json={'enabled': True, 'retention_days': 30})
        first = self.client.put('/api/history/labs', json=self.snapshot)
        self.assertEqual(first.status_code, 200, first.text)
        lab_id = first.json()['id']
        self.assertEqual(self.client.get('/api/history/labs').json()['total'], 1)
        lab = self.client.get(f'/api/history/labs/{lab_id}').json()
        self.assertEqual(lab['snapshot']['experiment']['modified_subject'], 'Account information')
        self.assertNotIn('token', lab['snapshot']['email'])
        self.assertNotIn('links', lab['snapshot']['email'])
        self.assertNotIn('private_key', lab['snapshot']['experiment'])
        self.assertNotIn(b'DO NOT STORE ME', (Path(self.temporary.name)/'history.db').read_bytes())
        self.snapshot['experiment']['modified_subject'] = 'Different version'
        updated = self.client.put('/api/history/labs', json=self.snapshot)
        self.assertEqual(updated.json()['id'], lab_id)
        self.assertEqual(self.client.get(f'/api/history/labs/{lab_id}').json()['revision'], 2)
        self.assertEqual(self.client.delete(f'/api/history/labs/{lab_id}').status_code, 200)
        self.assertEqual(self.client.get('/api/history/labs').json()['total'], 0)

    def test_feedback_targets_hashed_message_and_clearing_removes_labs(self):
        scans.update_history_settings(enabled=True, retention_days=90)
        scans.record_scans([{'id': 'demo-abc', 'subject': 'Account notice', 'sender': 'Example',
                             'classification': 'Potential threat', 'confidence': 88, 'malicious_probability': 88}], 'demo')
        accepted = self.client.post('/api/history/feedback/by-email', json={'source': 'demo',
             'email_id': 'demo-abc', 'verdict': 'incorrect', 'note': 'False positive'})
        self.assertEqual(accepted.status_code, 200, accepted.text)
        self.assertEqual(scans.list_history()['items'][0]['feedback_verdict'], 'incorrect')
        self.assertEqual(self.client.post('/api/history/feedback/by-email',json={
            'source':'demo', 'email_id':'wrong', 'verdict':'incorrect', 'note':''}).status_code,404)
        self.client.put('/api/history/labs', json=self.snapshot)
        self.assertEqual(self.client.delete('/api/history/scans').status_code, 200)
        self.assertEqual(self.client.get('/api/history/labs').json()['total'], 0)

    def test_lab_endpoints_reject_remote_and_cross_origin(self):
        self.assertEqual(self.remote.get('/api/history/labs').status_code, 403)
        self.assertEqual(self.client.put('/api/history/labs', json=self.snapshot,
            headers={'Origin': 'https://untrusted.example'}).status_code, 403)


class GoogleProfileTests(unittest.TestCase):
    def test_avatar_url_only_allows_google_images(self):
        self.assertTrue(gmail_service._approved_avatar_url('https://lh3.googleusercontent.com/a/photo'))
        for value in ('http://lh3.googleusercontent.com/a', 'https://evil.test/image',
                      'https://googleusercontent.com.evil.test/a', 'https://lh3.googleusercontent.com:400/a'):
            self.assertFalse(gmail_service._approved_avatar_url(value))

    def test_no_identity_token_uses_email_without_external_call(self):
        with patch.object(gmail_service, '_profile_lock'):
            name, photo = gmail_service._google_identity(object(), 'owner@example.test')
        self.assertEqual((name, photo), ('owner', False))

if __name__ == '__main__':
    unittest.main()
