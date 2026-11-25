"""Local-only debugging API contracts and browser-independent test execution."""
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from app.main import app
from app.services import device_ai_settings as ai


class DebuggingAPITests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app, client=('127.0.0.1', 53221))
        self.headers = {'X-PhishLab-Local-Settings': 'save', 'Origin': 'http://127.0.0.1:5173'}

    def test_detected_status_has_public_safe_fields(self):
        response = self.client.get('/api/debug/ai-settings')
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn('detected_defaults', response.json())
        self.assertIn('detected', response.json())
        self.assertNotIn('token.json', str(response.json()))

    def test_setting_change_requires_local_origin_and_request_header(self):
        self.assertEqual(self.client.put('/api/debug/ai-settings', json={'mode': 'auto'}).status_code, 403)
        self.assertEqual(self.client.put('/api/debug/ai-settings', json={'mode': 'auto'},
                                         headers={**self.headers, 'Origin': 'https://other.example'}).status_code, 403)
        remote = TestClient(app, client=('192.0.2.1', 53221))
        self.assertEqual(remote.put('/api/debug/ai-settings', json={'mode': 'auto'},
                                    headers=self.headers).status_code, 403)

    def test_manual_override_and_reset_apply_immediately(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(ai, '_SETTINGS_FILE', Path(folder) / 'config.json'):
            payload = {'mode': 'manual', 'enabled': False, 'gpu_layers': 0, 'threads': 3,
                       'context_size': 1024, 'batch_size': 64, 'generation_timeout_seconds': 40}
            result = self.client.put('/api/debug/ai-settings', json=payload, headers=self.headers)
            self.assertEqual(result.status_code, 200, result.text)
            self.assertEqual(result.json()['threads'], 3)
            self.assertEqual(self.client.get('/api/ai-status').json()['threads'], 3)
            reset = self.client.put('/api/debug/ai-settings', json={'mode': 'auto'}, headers=self.headers)
            self.assertEqual(reset.status_code, 200)
            self.assertEqual(reset.json()['mode'], 'auto')

    def test_tests_hidden_by_default_and_explicitly_opted_in(self):
        with patch.dict('os.environ', {'PHISHLAB_ENABLE_TEST_RUNNER': '0'}):
            self.assertEqual(self.client.get('/api/debug/python-tests').status_code, 404)
        with patch.dict('os.environ', {'PHISHLAB_ENABLE_TEST_RUNNER': '1'}):
            files = self.client.get('/api/debug/python-tests')
            self.assertEqual(files.status_code, 200)
            self.assertTrue(files.json()['tests'])
            self.assertEqual(self.client.post('/api/debug/python-tests/run', json={'test_id': 'test_device_ai_settings.py'}).status_code, 403)
            self.assertEqual(self.client.post('/api/debug/python-tests/run', json={'test_id': '../random.py'},
                                              headers={'X-PhishLab-Local-Tests': 'run'}).status_code, 400)


if __name__ == '__main__':
    unittest.main()
