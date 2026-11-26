"""Windows AMD/Vulkan hardware probes are offline and fail closed."""
import os
import subprocess
import unittest
from unittest.mock import patch

from app.services import device_ai_settings as ai


class WindowsVulkanDetectionTests(unittest.TestCase):
    def tearDown(self):
        ai.detect_device_profile.cache_clear()

    def _profile(self, *, nvidia=False, amd=True, loader=True, packaged=None):
        ai.detect_device_profile.cache_clear()
        env = dict(os.environ)
        env.pop('PHISHLAB_BUNDLED_AI_BACKEND', None)
        if packaged:
            env['PHISHLAB_BUNDLED_AI_BACKEND'] = packaged
        with (patch.dict(os.environ, env, clear=True),
              patch('platform.system', return_value='Windows'),
              patch('platform.machine', return_value='AMD64'),
              patch.object(ai, '_nvidia_cuda_available', return_value=nvidia),
              patch.object(ai, '_windows_amd_gpu_available', return_value=amd),
              patch.object(ai, '_windows_vulkan_loader_available', return_value=loader)):
            return ai.detect_device_profile()

    def test_amd_vulkan_gpu_layers_enabled(self):
        profile = self._profile()
        self.assertEqual(profile.install_backend, 'vulkan')
        self.assertEqual(profile.profile, 'amd-vulkan')
        self.assertEqual(profile.gpu_layers, -1)

    def test_amd_without_loader_stays_cpu(self):
        profile = self._profile(loader=False)
        self.assertEqual(profile.install_backend, 'cpu')
        self.assertEqual(profile.gpu_layers, 0)
        self.assertIn('Vulkan', profile.note)

    def test_nvidia_cuda_preserved_by_default(self):
        self.assertEqual(self._profile(nvidia=True).install_backend, 'cuda')

    def test_bundled_vulkan_uses_vulkan_on_nvidia_too(self):
        profile = self._profile(nvidia=True, amd=False, packaged='vulkan')
        self.assertEqual(profile.install_backend, 'vulkan')
        self.assertEqual(profile.gpu_layers, -1)

    def test_bundled_cpu_does_not_pretend_gpu(self):
        profile = self._profile(packaged='cpu')
        self.assertEqual(profile.install_backend, 'cpu')
        self.assertEqual(profile.gpu_layers, 0)

    def test_bundled_vulkan_without_loader_stays_cpu(self):
        profile = self._profile(packaged='vulkan', loader=False)
        self.assertEqual(profile.install_backend, 'cpu')

    def test_nvidia_cuda_only_build_on_amd_stays_cpu(self):
        profile = self._profile(packaged='cuda')
        self.assertEqual(profile.install_backend, 'cpu')
        self.assertEqual(profile.gpu_layers, 0)

    def test_amd_ven_1002_adapter_detected(self):
        with patch.object(ai, '_windows_gpu_adapters', return_value=[{'Name':'Generic Display Device', 'PNPDeviceID':'PCI\\VEN_1002&DEV_1234'}]):
            self.assertTrue(ai._windows_amd_gpu_available())

    def test_unrecognized_gpu_does_not_count_as_amd(self):
        with patch.object(ai, '_windows_gpu_adapters', return_value=[{'Name':'Intel UHD graphics'}]):
            self.assertFalse(ai._windows_amd_gpu_available())

    def test_powershell_missing_is_safe(self):
        with patch('platform.system', return_value='Windows'), patch.object(ai.subprocess, 'run', side_effect=OSError('not installed')):
            self.assertEqual(ai._windows_gpu_adapters(), [])

    def test_adapter_json_single_and_multiple(self):
        mock = lambda val: subprocess.CompletedProcess([], 0, val, '')
        with patch('platform.system', return_value='Windows'), patch.object(ai.subprocess, 'run', return_value=mock('{"Name":"AMD Radeon"}')):
            self.assertEqual(len(ai._windows_gpu_adapters()), 1)
        with patch('platform.system', return_value='Windows'), patch.object(ai.subprocess, 'run', return_value=mock('[{"Name":"AMD Radeon"},{"Name":"Intel"}]')):
            self.assertEqual(len(ai._windows_gpu_adapters()), 2)


if __name__ == '__main__':
    unittest.main()
