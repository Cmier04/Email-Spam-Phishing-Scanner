"""Electron user-data directories are optional overrides; default backend paths stay unchanged."""
from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class DesktopRuntimePathsTests(unittest.TestCase):
    def test_packaged_model_and_credentials_paths(self):
        with tempfile.TemporaryDirectory() as temp:
            env = os.environ.copy()
            env.update({
                'PHISHLAB_CLASSIFIER_MODEL_PATH': str(Path(temp) / 'classifier.pkl'),
                'PHISHLAB_GMAIL_TOKEN_PATH': str(Path(temp) / 'token.json'),
                'PHISHLAB_GMAIL_CREDENTIALS_PATH': str(Path(temp) / 'credentials.json'),
                'PHISHLAB_AI_SETTINGS_PATH': str(Path(temp) / 'ai.json'),
            })
            script = ('from app.services import classifier_service, gmail_service, device_ai_settings\n'
                      'import os\n'
                      'assert str(classifier_service.MODEL_PATH)==os.environ["PHISHLAB_CLASSIFIER_MODEL_PATH"]\n'
                      'assert str(gmail_service.TOKEN_PATH)==os.environ["PHISHLAB_GMAIL_TOKEN_PATH"]\n'
                      'assert str(gmail_service.CREDENTIALS_PATH)==os.environ["PHISHLAB_GMAIL_CREDENTIALS_PATH"]\n'
                      'assert str(device_ai_settings._SETTINGS_FILE)==os.environ["PHISHLAB_AI_SETTINGS_PATH"]\n')
            result = subprocess.run([sys.executable, '-c', script], cwd=ROOT, env=env,
                                    capture_output=True, text=True, timeout=15)
            self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == '__main__':
    unittest.main()
