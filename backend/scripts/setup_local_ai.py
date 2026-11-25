"""Install a verified local Qwen runtime using a detected Metal, CUDA or CPU profile.

Run explicitly on the machine hosting FastAPI:
    python scripts/setup_local_ai.py
    python scripts/setup_local_ai.py --skip-model

Do not run this installer as an HTTP request or during an API startup.
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys

_BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_BACKEND))
from app.services.device_ai_settings import detect_device_profile  # noqa: E402


def _install_native(backend: str) -> bool:
    env = os.environ.copy()
    if backend == 'cuda' and not shutil.which('nvcc'):
        print('NVIDIA GPU found, but the CUDA toolkit compiler (nvcc) is missing. Trying CPU runtime instead.')
        return False
    if backend == 'cuda':
        env['CMAKE_ARGS'] = '-DGGML_CUDA=on'
    elif backend == 'metal':
        env['CMAKE_ARGS'] = '-DGGML_METAL=on'
    else:
        env['CMAKE_ARGS'] = '-DGGML_CUDA=off -DGGML_METAL=off'
    print(f'Installing llama-cpp-python for {backend}...')
    result = subprocess.run(
        [sys.executable, '-m', 'pip', 'install', '--upgrade', '--force-reinstall',
         '--no-cache-dir', '--no-binary=llama-cpp-python', '--no-deps',
         'llama-cpp-python>=0.3.9,<0.4'], env=env, cwd=_BACKEND, check=False,
    )
    return result.returncode == 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--skip-model', action='store_true', help='Do not download the checked GGUF model')
    parser.add_argument('--cpu', action='store_true', help='Prefer portable CPU backend')
    args = parser.parse_args(argv)
    profile = detect_device_profile()
    preferred = 'cpu' if args.cpu else profile.install_backend
    print(f'Detected: {profile.device} (profile {profile.profile}); preferred native backend: {preferred}')
    # Install Python prerequisites first; no system-wide installation is requested.
    if subprocess.run([sys.executable, '-m', 'pip', 'install', '-r',
                       str(_BACKEND / 'requirements.txt')], check=False).returncode != 0:
        print('Core dependency installation failed.', file=sys.stderr)
        return 1
    installed_backend = preferred
    if not _install_native(preferred):
        if preferred == 'cpu' or not _install_native('cpu'):
            print('Native Qwen runtime could not be installed; the backend remains usable without local AI.', file=sys.stderr)
            return 2
        installed_backend = 'cpu'
        print('Fallback: CPU runtime installed. GPU layers will be set to zero.')
        # Persist the appropriate CPU choice: device detection may still see
        # an NVIDIA adapter even if the CUDA toolkit is unavailable.
    if installed_backend == 'cpu' and profile.install_backend != 'cpu':
        from app.services.device_ai_settings import save_override, resolved_ai_configuration
        values = resolved_ai_configuration()
        save_override({k: values[k] for k in ('enabled', 'gpu_layers', 'threads', 'context_size',
                                             'batch_size', 'generation_timeout_seconds')} |
                      {'mode': 'manual', 'enabled': True, 'gpu_layers': 0})
    if not args.skip_model:
        sys.path.insert(0, str(_BACKEND / 'scripts'))
        from download_summary_model import download_model
        if download_model() != 0:
            print('The runtime is installed; download the model separately to enable AI.', file=sys.stderr)
            return 3
    print('Installation finished. Restart FastAPI; detected or overridden settings are applied automatically.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
