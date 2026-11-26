"""Offline tests for selecting prebuilt llama-cpp-python wheels safely."""
from types import SimpleNamespace
import sys
import unittest
from unittest.mock import call, patch

from scripts import setup_local_ai as setup


class LocalAIInstallerTests(unittest.TestCase):
    @patch.object(setup, '_run', return_value=True)
    def test_metal_index_prefers_binary_wheel_without_source_build(self, run):
        self.assertTrue(setup._install_wheel('metal'))
        args = run.call_args.args[0]
        self.assertIn('--only-binary=llama-cpp-python', args)
        self.assertNotIn('--no-binary=llama-cpp-python', args)
        self.assertNotIn('--extra-index-url', args)
        self.assertEqual(args[args.index('--index-url') + 1],
                         'https://abetlen.github.io/llama-cpp-python/whl/metal')

    @patch.object(setup, '_run', return_value=True)
    def test_cpu_index_is_official_not_placeholder(self, run):
        self.assertTrue(setup._install_wheel('cpu'))
        args = run.call_args.args[0]
        self.assertEqual(args[args.index('--index-url') + 1],
                         'https://abetlen.github.io/llama-cpp-python/whl/cpu')

    @patch.object(setup, '_run', return_value=True)
    def test_cuda_index_uses_selected_runtime_version(self, run):
        self.assertTrue(setup._install_wheel('cuda', cuda_wheel='cu130'))
        args = run.call_args.args[0]
        self.assertEqual(args[args.index('--index-url') + 1],
                         'https://abetlen.github.io/llama-cpp-python/whl/cu130')
        self.assertFalse(setup._install_wheel('cuda', cuda_wheel=None))
        self.assertEqual(run.call_count, 1)

    @patch.object(setup, '_run', return_value=True)
    def test_official_vulkan_index_is_selected(self, run):
        self.assertTrue(setup._install_wheel('vulkan'))
        args = run.call_args.args[0]
        self.assertIn('--only-binary=llama-cpp-python', args)
        self.assertEqual(args[args.index('--index-url') + 1],
                         'https://abetlen.github.io/llama-cpp-python/whl/vulkan')

    @patch.object(setup, '_run', return_value=True)
    def test_vulkan_source_build_is_opt_in(self, run):
        self.assertTrue(setup._install_from_source('vulkan'))
        self.assertEqual(run.call_args.kwargs['env']['CMAKE_ARGS'], '-DGGML_VULKAN=on')

    @patch.object(setup, '_run', return_value=True)
    @patch.object(setup, '_try_install', side_effect=[False, True])
    @patch.object(setup, '_apply_cpu_fallback_settings')
    @patch.object(setup, 'detect_device_profile')
    def test_amd_falls_back_to_cpu(self, detect, settings, install, run):
        from tempfile import TemporaryDirectory
        from pathlib import Path
        detect.return_value = SimpleNamespace(device='AMD GPU', profile='amd-vulkan', install_backend='vulkan')
        with TemporaryDirectory() as tmp, patch.object(setup, '_BACKEND', Path(tmp)):
            (Path(tmp) / 'requirements.txt').write_text('', encoding='utf-8')
            self.assertEqual(setup.main(['--skip-model']), 0)
        self.assertEqual(install.call_args_list, [
            call('vulkan', cuda_wheel=None, allow_source_build=False),
            call('cpu', cuda_wheel=None, allow_source_build=False),
        ])
        settings.assert_called_once_with('vulkan')

    @patch.object(setup, '_run', return_value=True)
    @patch.object(setup, '_try_install', return_value=True)
    @patch.object(setup, 'detect_device_profile')
    def test_vulkan_override_writes_verified_manifest(self, detect, install, run):
        from tempfile import TemporaryDirectory
        from pathlib import Path
        import json
        detect.return_value = SimpleNamespace(device='NVIDIA GPU', profile='nvidia-cuda', install_backend='cuda')
        with TemporaryDirectory() as tmp, patch.object(setup, '_BACKEND', Path(tmp)), patch.object(setup.platform, 'system', return_value='Windows'):
            (Path(tmp) / 'requirements.txt').write_text('', encoding='utf-8')
            self.assertEqual(setup.main(['--vulkan', '--skip-model']), 0)
            self.assertEqual(json.loads((Path(tmp) / '.local-ai-runtime.json').read_text())['backend'], 'vulkan')
        install.assert_called_once_with('vulkan', cuda_wheel=None, allow_source_build=False)

    @patch.object(setup, '_run', return_value=True)
    @patch.object(setup, '_try_install', return_value=True)
    @patch.object(setup, 'detect_device_profile')
    def test_force_vulkan_not_accepted_on_mac(self, detect, install, run):
        detect.return_value = SimpleNamespace(device='Mac', profile='apple-metal', install_backend='metal')
        with patch.object(setup.platform, 'system', return_value='Darwin'):
            with self.assertRaises(SystemExit):
                setup.main(['--vulkan', '--skip-model'])
        install.assert_not_called()

    @patch.object(setup, '_tool_output')
    def test_cuda_version_from_nvcc(self, tool):
        tool.side_effect = lambda name, *args: (
            'Cuda compilation tools, release 12.4, V12.4.123' if name == 'nvcc'
            else 'CUDA Version: 13.0'
        )
        self.assertEqual(setup._cuda_wheel_from_host(), 'cu124')
        tool.assert_called_once_with('nvcc', '--version')

    @patch.object(setup, '_tool_output')
    def test_cuda_version_from_driver_when_no_nvcc(self, tool):
        tool.side_effect = lambda name, *args: '' if name == 'nvcc' else 'CUDA Version: 13.0'
        self.assertEqual(setup._cuda_wheel_from_host(), 'cu130')

    @patch.object(setup, '_tool_output', return_value='Cuda compilation tools, release 12.8, V12.8')
    def test_unknown_cuda_version_is_not_guessed(self, tool):
        self.assertIsNone(setup._cuda_wheel_from_host())

    @patch.object(setup, '_install_from_source')
    @patch.object(setup, '_verify_runtime', return_value=True)
    @patch.object(setup, '_install_wheel', return_value=True)
    def test_source_compilation_is_opt_in(self, wheel, verify, source):
        self.assertTrue(setup._try_install('metal', cuda_wheel=None, allow_source_build=False))
        source.assert_not_called()

    @patch.object(setup, '_install_from_source', return_value=True)
    @patch.object(setup, '_verify_runtime', return_value=True)
    @patch.object(setup, '_install_wheel', return_value=False)
    def test_opt_in_build_when_wheel_is_unavailable(self, wheel, verify, source):
        self.assertTrue(setup._try_install('metal', cuda_wheel=None, allow_source_build=True))
        source.assert_called_once_with('metal')

    @patch.object(setup, '_install_from_source')
    @patch.object(setup, '_verify_runtime')
    @patch.object(setup, '_install_wheel', return_value=False)
    def test_failed_wheel_does_not_compile_automatically(self, wheel, verify, source):
        self.assertFalse(setup._try_install('metal', cuda_wheel=None, allow_source_build=False))
        source.assert_not_called()
        verify.assert_not_called()

    @patch.object(setup, '_apply_cpu_fallback_settings')
    @patch.object(setup, '_try_install')
    @patch.object(setup, '_run', return_value=True)
    @patch.object(setup, 'detect_device_profile')
    def test_metal_falls_back_to_cpu_without_build(self, profile, run, try_install, settings):
        profile.return_value = SimpleNamespace(device='Mac', profile='apple-metal', install_backend='metal')
        try_install.side_effect = [False, True]
        self.assertEqual(setup.main(['--skip-model']), 0)
        self.assertEqual(try_install.call_args_list, [
            call('metal', cuda_wheel=None, allow_source_build=False),
            call('cpu', cuda_wheel=None, allow_source_build=False),
        ])
        settings.assert_called_once_with('metal')

    @patch.object(setup, '_try_install')
    @patch.object(setup, '_run', return_value=True)
    @patch.object(setup, 'detect_device_profile')
    def test_installer_fails_when_no_wheels_without_source(self, profile, run, try_install):
        profile.return_value = SimpleNamespace(device='CPU', profile='cpu', install_backend='cpu')
        try_install.return_value = False
        self.assertEqual(setup.main(['--cpu', '--skip-model']), 2)


if __name__ == '__main__':
    unittest.main()
