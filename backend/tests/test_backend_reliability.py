"""Regression tests for local-only privacy, classifier and Gmail recovery."""
import math
import os
from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.services import classifier_service, gmail_service
from app.services.classifier_service import (
    ClassifierPredictionError, ClassifierUnavailableError,
    classifier_available, classify_email_detailed,
)


class BrokenClassifier:
    classes_ = [0, 1]

    def predict(self, texts):
        return [1]

    def predict_proba(self, texts):
        return [[float('nan'), 0.6]]


class BackendReliabilityTests(unittest.TestCase):
    def setUp(self):
        self.local = TestClient(app, client=('127.0.0.1', 50001))
        self.remote = TestClient(app, client=('198.51.100.7', 50001))

    def test_missing_classifier_is_actionable_without_leaking_internal_path(self):
        with patch.object(classifier_service, 'model', None), patch.object(
            classifier_service, 'MODEL_PATH', Path('/not/installed/synthetic-fixture.pkl')
        ):
            response = self.local.post('/api/classify', json={'subject':'Test', 'body':'Hello'})
            self.assertEqual(response.status_code, 503)
            self.assertIn('trained email classifier', response.json()['detail'])
            self.assertNotIn('/not/installed', response.text)
            self.assertFalse(classifier_available())

    def test_lazy_classifier_loading_recovers_after_model_is_installed(self):
        with tempfile.TemporaryDirectory() as temp:
            model_path = Path(temp) / 'model.pkl'
            fake = Mock()
            fake.predict.return_value = [1]
            fake.predict_proba.return_value = [[0.2, 0.8]]
            fake.classes_ = [0, 1]
            with patch.object(classifier_service, 'model', None), patch.object(
                classifier_service, 'MODEL_PATH', model_path
            ), patch.object(classifier_service.joblib, 'load', return_value=fake) as load:
                with self.assertRaises(ClassifierUnavailableError):
                    classify_email_detailed('subject', 'body')
                model_path.write_bytes(b'test-fixture-only')
                result = classify_email_detailed('subject', 'body')
                self.assertEqual(result['malicious_probability'], 80)
                self.assertEqual(result['classification'], 'Potential threat')
                load.assert_called_once_with(model_path)

    def test_invalid_classifier_proba_fails_closed_without_fabricated_score(self):
        with patch.object(classifier_service, 'model', BrokenClassifier()):
            with self.assertRaises(ClassifierPredictionError):
                classify_email_detailed('hi', 'body')
            response = self.local.post('/api/classify', json={'subject':'hi', 'body':'body'})
            self.assertEqual(response.status_code, 503)
            self.assertNotIn('nan', response.text.lower())

    def test_email_classification_input_and_whatif_work_limited(self):
        response = self.local.post('/api/classify', json={'subject':'x'*1001, 'body':'ok'})
        self.assertEqual(response.status_code, 422)
        response = self.local.post('/api/what-if', json={
            'email_id': 'demo-001',
            'transformations': [{'part':'body', 'transformation_id':'body-rephrase'}]*13,
        })
        self.assertEqual(response.status_code, 422)

    def test_gmail_reads_and_whatif_are_local_only_and_check_origin(self):
        for path in ('/api/gmail/status', '/api/gmail/recent', '/api/gmail/latest'):
            self.assertEqual(self.remote.get(path).status_code, 403)
            self.assertEqual(self.local.get(path, headers={'Origin':'https://other.example'}).status_code, 403)
        response = self.remote.post('/api/what-if', json={
            'email_id': 'some-id',
            'transformations':[{'part':'subject','transformation_id':'subject-format'}],
        })
        self.assertEqual(response.status_code, 403)
        response = self.local.post('/api/what-if', headers={'Origin':'https://other.example'}, json={
            'email_id': 'demo-001',
            'transformations':[{'part':'subject','transformation_id':'subject-format'}],
        })
        self.assertEqual(response.status_code, 403)

    def test_core_readiness_can_be_ready_with_optional_ai_missing(self):
        with patch('app.api.system.classifier_available', return_value=True), patch(
            'app.api.system.get_local_ai_status', return_value={'enabled':False,'model_file_available':False}
        ):
            response = self.local.get('/api/system/status')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['status'], 'ready')
        self.assertFalse(response.json()['qwen_enabled'])

    def test_missing_classifier_returns_503_for_demo_and_lab(self):
        with patch.object(classifier_service, 'model', None), patch.object(
            classifier_service, 'MODEL_PATH', Path('/missing-for-test/classifier.pkl')
        ):
            demo = self.local.get('/api/demo/emails')
            lab = self.local.post('/api/what-if', json={
                'email_id':'demo-001',
                'transformations':[{'part':'subject','transformation_id':'subject-format'}],
            })
        self.assertEqual(demo.status_code, 503)
        self.assertEqual(lab.status_code, 503)
        self.assertIn('trained email classifier', lab.json()['detail'])

    def test_token_file_is_unchanged_if_serialization_fails(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(
            gmail_service, 'TOKEN_PATH', Path(folder)/'token.json'
        ):
            old = Path(folder)/'token.json'
            old.write_text('existing authorized token', encoding='utf8')
            fake = Mock()
            fake.to_json.side_effect = ValueError('malformed token')
            with self.assertRaises(ValueError):
                gmail_service._save_credentials(fake)
            self.assertEqual(old.read_text(encoding='utf8'), 'existing authorized token')
            self.assertEqual(set(Path(folder).iterdir()), {old})

    def test_readiness_exposes_only_non_sensitive_flags(self):
        with patch('app.api.system.classifier_available', return_value=False), patch(
            'app.api.system.get_local_ai_status', return_value={'enabled':False, 'model_file_available':False}
        ), patch('app.api.system.CREDENTIALS_PATH', Path('/unavailable/credentials.json')):
            response = self.local.get('/api/system/status')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['status'], 'setup_required')
        self.assertFalse(response.json()['classifier_ready'])
        self.assertNotIn('token', response.text.lower())
        self.assertNotIn('email', str(response.json().keys()).lower())
        self.assertEqual(self.remote.get('/api/system/status').status_code, 403)

    def test_gmail_token_write_atomic_permissions_and_no_stray_tmp(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(
            gmail_service, 'TOKEN_PATH', Path(folder)/'token.json'
        ):
            token_path = Path(folder)/'token.json'
            fake = Mock()
            fake.to_json.return_value = '{"testing": true}'
            gmail_service._save_credentials(fake)
            self.assertEqual(token_path.read_text(encoding='utf8'), '{"testing": true}')
            self.assertEqual(set(Path(folder).iterdir()), {token_path})
            if os.name == 'posix':
                self.assertEqual(token_path.stat().st_mode & 0o777, 0o600)

    def test_refresh_network_failure_does_not_claim_token_was_revoked(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(
            gmail_service, 'TOKEN_PATH', Path(folder)/'token.json'
        ):
            gmail_service.TOKEN_PATH.write_text('{"fake": true}', encoding='utf-8')
            credential = Mock(expired=True, refresh_token='synthetic', valid=False)
            credential.refresh.side_effect = ConnectionError('private request')
            credentials = Mock()
            credentials.from_authorized_user_file.return_value = credential
            google = {
                'Credentials': credentials, 'RefreshError': ValueError,
                'TransportError': ConnectionError, 'Request': Mock(return_value=object()),
            }
            with patch.object(gmail_service, '_gmail_imports', return_value=google):
                with self.assertRaises(gmail_service.GmailAPIError) as error:
                    gmail_service._load_existing_credentials()
            self.assertIn('retry', str(error.exception).lower())
            self.assertNotIn('private request', str(error.exception))

    def test_manual_ai_settings_reset_worker_cache(self):
        with patch('app.services.local_ai_summary_service.reset_local_ai_worker') as reset, patch(
            'app.api.debugging.save_override', return_value={'mode':'auto'}
        ):
            result = self.local.put('/api/debug/ai-settings', json={'mode':'auto'}, headers={
                'X-PhishLab-Local-Settings': 'save', 'Origin':'http://127.0.0.1:5173'
            })
        self.assertEqual(result.status_code, 200)
        reset.assert_called_once()

    def test_gmail_401_prompts_reauthorization_while_429_is_transient(self):
        unauthorized = Exception('private body / header')
        unauthorized.resp = SimpleNamespace(status=401)
        throttled = Exception('private body / header')
        throttled.resp = SimpleNamespace(status=429)
        self.assertIsInstance(gmail_service._gmail_api_failure(unauthorized, 'Unable to get inbox'), gmail_service.GmailAuthenticationError)
        err = gmail_service._gmail_api_failure(throttled, 'Unable to get inbox')
        self.assertIsInstance(err, gmail_service.GmailAPIError)
        self.assertNotIn('private body', str(err))


if __name__ == '__main__':
    unittest.main()
