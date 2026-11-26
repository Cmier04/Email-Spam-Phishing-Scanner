"""Install a verified local Qwen runtime with prebuilt wheels when available.

Run explicitly on the machine hosting FastAPI:
    python scripts/setup_local_ai.py
    python scripts/setup_local_ai.py --skip-model
    python scripts/setup_local_ai.py --cuda-wheel cu130  # CUDA host only
    python scripts/setup_local_ai.py --vulkan          # Windows portable GPU build

A prebuilt CPU, Metal, CUDA, or Vulkan wheel is preferred; no C++ compilation occurs
unless --allow-source-build is explicitly supplied. Never call from an API.
"""
from __future__ import annotations

import argparse
import json
import platform
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

_BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_BACKEND))
from app.services.device_ai_settings import detect_device_profile  # noqa: E402

_PACKAGE = 'llama-cpp-python>=0.3.9,<0.4'
_WHEEL_ROOT = 'https://abetlen.github.io/llama-cpp-python/whl'
_CUDA_WHEELS = {
    (11, 8): 'cu118',
    (12, 1): 'cu121',
    (12, 2): 'cu122',
    (12, 3): 'cu123',
    (12, 4): 'cu124',
    (12, 5): 'cu125',
    (13, 0): 'cu130',
    (13, 2): 'cu132',
}


def _run(command: list[str], *, env: dict[str, str] | None = None) -> bool:
    """Execute a fixed, argument-vector command without shell interpolation."""
    try:
        return subprocess.run(command, env=env, cwd=_BACKEND, check=False).returncode == 0
    except OSError as exc:
        print(f'Could not start installer: {exc}', file=sys.stderr)
        return False


def _tool_output(executable: str, *args: str) -> str:
    if not shutil.which(executable):
        return ''
    try:
        result = subprocess.run(
            [executable, *args], capture_output=True, text=True, timeout=8, check=False,
        )
        return result.stdout if result.returncode == 0 else ''
    except (OSError, subprocess.TimeoutExpired):
        return ''


def _cuda_wheel_from_host() -> str | None:
    """Prefer the installed CUDA toolkit; fall back to the driver's advertised CUDA."""
    compiler = _tool_output('nvcc', '--version')
    match = re.search(r'\brelease\s+(\d+)\.(\d+)\b', compiler)
    if match:
        version = tuple(map(int, match.groups()))
        wheel = _CUDA_WHEELS.get(version)
        if not wheel:
            print(f'CUDA toolkit {version[0]}.{version[1]} has no matching listed prebuilt wheel.')
        return wheel

    driver = _tool_output('nvidia-smi')
    match = re.search(r'CUDA Version:\s*(\d+)\.(\d+)\b', driver)
    if match:
        version = tuple(map(int, match.groups()))
        wheel = _CUDA_WHEELS.get(version)
        if not wheel:
            print(f'NVIDIA driver advertises CUDA {version[0]}.{version[1]}, but no exact wheel is listed.')
        return wheel
    return None


def _install_wheel(backend: str, *, cuda_wheel: str | None = None) -> bool:
    if backend == 'cuda':
        if cuda_wheel not in _CUDA_WHEELS.values():
            print('No supported CUDA wheel version detected; use --cuda-wheel or try CPU.', file=sys.stderr)
            return False
        directory = cuda_wheel
    elif backend in ('cpu', 'metal', 'vulkan'):
        directory = backend
    else:
        raise ValueError(f'Unsupported AI backend: {backend}')

    # Use the dedicated index only. --extra-index-url can prefer a newer CPU
    # release from PyPI over a GPU-specific build in a secondary index.
    index = f'{_WHEEL_ROOT}/{directory}'
    print(f'Installing a prebuilt {backend} wheel from {index} ...')
    return _run([
        sys.executable, '-m', 'pip', 'install', '--upgrade', '--force-reinstall',
        '--no-cache-dir', '--only-binary=llama-cpp-python', '--no-deps',
        '--index-url', index, _PACKAGE,
    ])


def _install_from_source(backend: str) -> bool:
    """Opt-in compilation if a wheel cannot be used."""
    if backend == 'cuda' and not shutil.which('nvcc'):
        print('CUDA compilation requires the nvcc compiler; skipping source build.')
        return False
    env = os.environ.copy()
    env['CMAKE_ARGS'] = {
        'cuda': '-DGGML_CUDA=on',
        'vulkan': '-DGGML_VULKAN=on',
        'metal': '-DGGML_METAL=on',
        'cpu': '-DGGML_CUDA=off -DGGML_METAL=off',
    }[backend]
    print(f'Building {backend} runtime from source (explicitly permitted)...')
    return _run([
        sys.executable, '-m', 'pip', 'install', '--upgrade', '--force-reinstall',
        '--no-cache-dir', '--no-binary=llama-cpp-python', '--no-deps', _PACKAGE,
    ], env=env)


def _verify_runtime(backend: str) -> bool:
    """Run an import/offloading check in a separate process, after installation."""
    code = (
        'from llama_cpp import Llama, llama_supports_gpu_offload; '
        'print("PHISHLAB_GPU_OFFLOAD=" + str(bool(llama_supports_gpu_offload())))'
    )
    try:
        result = subprocess.run(
            [sys.executable, '-c', code], capture_output=True, text=True,
            cwd=_BACKEND, timeout=30, check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        print(f'Runtime validation failed: {exc}', file=sys.stderr)
        return False
    if result.returncode != 0:
        print('The installed llama-cpp-python runtime failed to import.', file=sys.stderr)
        print(result.stderr[-1200:], file=sys.stderr)
        return False
    gpu = 'PHISHLAB_GPU_OFFLOAD=True' in result.stdout
    if backend != 'cpu' and not gpu:
        print(f'The {backend} runtime imports but reports no available GPU offloading.', file=sys.stderr)
        return False
    print(f'Runtime verified: {backend}; GPU offload available: {gpu}.')
    return True


def _try_install(backend: str, *, cuda_wheel: str | None, allow_source_build: bool) -> bool:
    if _install_wheel(backend, cuda_wheel=cuda_wheel) and _verify_runtime(backend):
        return True
    if allow_source_build:
        if _install_from_source(backend) and _verify_runtime(backend):
            return True
    return False


def _apply_cpu_fallback_settings(profile_backend: str) -> None:
    if profile_backend == 'cpu':
        return
    from app.services.device_ai_settings import read_override, resolved_ai_configuration, save_override

    if read_override()['mode'] == 'manual':
        print('Existing manual AI settings were preserved. Set GPU layers to 0 in Settings if needed.')
        return
    values = resolved_ai_configuration()
    save_override({k: values[k] for k in (
        'enabled', 'gpu_layers', 'threads', 'context_size',
        'batch_size', 'generation_timeout_seconds',
    )} | {'mode': 'manual', 'enabled': True, 'gpu_layers': 0})
    print('Saved CPU fallback settings (0 GPU layers). Switch to Auto detect in Settings after a later GPU install.')


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--skip-model', action='store_true', help='Do not download the checked GGUF model')
    backend_choice = parser.add_mutually_exclusive_group()
    backend_choice.add_argument('--cpu', action='store_true', help='Install portable CPU runtime, even if a GPU is detected')
    backend_choice.add_argument('--vulkan', action='store_true', help='Prefer cross-vendor Vulkan on Windows (AMD or NVIDIA)')
    parser.add_argument('--cuda-wheel', choices=sorted(set(_CUDA_WHEELS.values())),
                        help='Explicit CUDA wheel tag, e.g. cu124 or cu130 (CUDA host only)')
    parser.add_argument('--allow-source-build', action='store_true',
                        help='Permit C++ compilation if a compatible prebuilt wheel is unavailable')
    args = parser.parse_args(argv)

    profile = detect_device_profile()
    if args.vulkan and platform.system() != 'Windows':
        parser.error('--vulkan is only supported on Windows')
    preferred = 'cpu' if args.cpu else ('vulkan' if args.vulkan else profile.install_backend)
    if args.cuda_wheel and preferred != 'cuda':
        parser.error('--cuda-wheel requires a detected CUDA device and cannot be combined with --cpu or --vulkan')
    if sys.version_info[:2] not in ((3, 10), (3, 11), (3, 12)):
        print('Note: official prebuilt wheel instructions specify Python 3.10-3.12; '
              'if no matching wheel exists, use Python 3.11/3.12 or --allow-source-build.')

    cuda_wheel = (args.cuda_wheel or _cuda_wheel_from_host()) if preferred == 'cuda' else None
    print(f'Detected: {profile.device} (profile {profile.profile}); preferred backend: {preferred}')
    if preferred == 'cuda':
        print(f'CUDA wheel choice: {cuda_wheel or "unknown"}')

    if not _run([sys.executable, '-m', 'pip', 'install', '-r', str(_BACKEND / 'requirements.txt')]):
        print('Core dependency installation failed.', file=sys.stderr)
        return 1

    # The GPU/CPU wheel comes from a dedicated index with --no-deps, to avoid
    # PyPI selecting a different CPU package. Install its Python dependencies
    # separately from PyPI before installing the platform-specific wheel.
    if not _run([sys.executable, '-m', 'pip', 'install', 'diskcache>=5.6.1', 'jinja2>=2.11']):
        print('llama-cpp-python Python dependencies could not be installed.', file=sys.stderr)
        return 1

    installed_backend = preferred
    if not _try_install(preferred, cuda_wheel=cuda_wheel, allow_source_build=args.allow_source_build):
        if preferred == 'cpu' or not _try_install('cpu', cuda_wheel=None,
                                                  allow_source_build=args.allow_source_build):
            print('No working local AI runtime was installed. '
                  'Try Python 3.11/3.12, an alternate --cuda-wheel, or --allow-source-build.',
                  file=sys.stderr)
            return 2
        installed_backend = 'cpu'
        print('Fallback: CPU runtime installed. GPU offloading is disabled.')

    if installed_backend == 'cpu':
        _apply_cpu_fallback_settings(profile.install_backend)
    else:
        from app.services.device_ai_settings import read_override
        override = read_override()
        if override['mode'] == 'manual' and override['gpu_layers'] == 0:
            print('A saved manual override still has 0 GPU layers; switch to Auto detect in Settings to use the GPU.')

    if not args.skip_model:
        sys.path.insert(0, str(_BACKEND / 'scripts'))
        from download_summary_model import download_model
        if download_model() != 0:
            print('Runtime installed; download the GGUF model separately.', file=sys.stderr)
            return 3

    # A separate metadata file is created only after the native runtime has
    # actually passed import/offload verification. Release staging can use it
    # to tell Electron which native backend it packaged.
    runtime_file = _BACKEND / '.local-ai-runtime.json'
    runtime_file.write_text(json.dumps({'backend': installed_backend}, indent=2) + '\n', encoding='utf-8')
    print(f'Installed native runtime: {installed_backend}. Restart FastAPI/Electron to apply AI settings.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
