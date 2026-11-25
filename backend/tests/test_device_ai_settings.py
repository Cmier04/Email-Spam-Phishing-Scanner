"""Validate portable device profiles, strict manual settings, and safe storage."""
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from app.services import device_ai_settings as ai


class DeviceAISettingsTests(unittest.TestCase):
    def tearDown(self):
        ai.detect_device_profile.cache_clear()

    def test_apple_silicon_uses_metal(self):
        ai.detect_device_profile.cache_clear()
        with patch('platform.system', return_value='Darwin'), patch('platform.machine', return_value='arm64'):
            profile = ai.detect_device_profile()
        self.assertEqual(profile.install_backend, 'metal')
        self.assertEqual(profile.gpu_layers, -1)

    def test_unknown_system_is_cpu_only(self):
        ai.detect_device_profile.cache_clear()
        with patch('platform.system', return_value='UnknownOS'), patch('platform.machine', return_value='unknown'):
            profile = ai.detect_device_profile()
        self.assertEqual(profile.install_backend, 'cpu')
        self.assertEqual(profile.gpu_layers, 0)

    def test_cuda_requires_confirmed_nvidia_adapter(self):
        ai.detect_device_profile.cache_clear()
        with patch('platform.system', return_value='Linux'), patch('platform.machine', return_value='x86_64'), patch.object(ai, '_nvidia_cuda_available', return_value=True):
            self.assertEqual(ai.detect_device_profile().install_backend, 'cuda')
        ai.detect_device_profile.cache_clear()
        with patch('platform.system', return_value='Linux'), patch('platform.machine', return_value='x86_64'), patch.object(ai, '_nvidia_cuda_available', return_value=False):
            self.assertEqual(ai.detect_device_profile().gpu_layers, 0)

    def test_settings_are_validated_and_persist(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(ai, '_SETTINGS_FILE', Path(temp) / '.local-ai-settings.json'):
            setting = {'mode': 'manual', 'enabled': True, 'gpu_layers': -1,
                       'threads': 4, 'context_size': 2048, 'batch_size': 256,
                       'generation_timeout_seconds': 45}
            self.assertEqual(ai.save_override(setting), setting)
            self.assertEqual(ai.read_override(), setting)
            ai.save_override({'mode': 'auto'})
            self.assertEqual(ai.read_override(), {'mode': 'auto'})
            with self.assertRaises(ValueError):
                ai.save_override({**setting, 'threads': 1000})
            with self.assertRaises(ValueError):
                ai.save_override({**setting, 'model_path': '/tmp/untrusted.gguf'})
            with self.assertRaises(ValueError):
                ai.save_override({**setting, 'threads': True})

    def test_manual_overrides_environment_settings(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(ai, '_SETTINGS_FILE', Path(temp) / '.local-ai-settings.json'):
            manual = {'mode': 'manual', 'enabled': False, 'gpu_layers': 0,
                      'threads': 2, 'context_size': 1024, 'batch_size': 64,
                      'generation_timeout_seconds': 12}
            ai.save_override(manual)
            with patch.dict(os.environ, {'PHISHLAB_LOCAL_AI_ENABLED': '1', 'PHISHLAB_LOCAL_AI_GPU_LAYERS': '-1'}):
                result = ai.resolved_ai_configuration()
            self.assertEqual(result['mode'], 'manual')
            self.assertFalse(result['enabled'])
            self.assertEqual(result['gpu_layers'], 0)
