"""Safe device defaults and persistent, allowlisted user AI overrides.

Detection never executes code from email content or downloads models. The
backend chooses settings for the current machine, not the browser's device.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from functools import lru_cache
import importlib.util
import ctypes
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
from threading import Lock
from typing import Any

_ROOT = Path(__file__).resolve().parents[2]
_SETTINGS_FILE = Path(os.getenv('PHISHLAB_AI_SETTINGS_PATH', str(_ROOT / '.local-ai-settings.json'))).expanduser()
_LOCK = Lock()
_FIELDS = {
    'gpu_layers': (-1, 200), 'threads': (1, 32),
    'context_size': (1024, 8192), 'batch_size': (32, 1024),
    'generation_timeout_seconds': (5, 180),
}


@dataclass(frozen=True)
class DeviceProfile:
    profile: str
    device: str
    gpu_layers: int
    threads: int
    context_size: int
    batch_size: int
    generation_timeout_seconds: int
    install_backend: str
    note: str


def _nvidia_cuda_available() -> bool:
    if not shutil.which('nvidia-smi'):
        return False
    try:
        result = subprocess.run(
            ['nvidia-smi', '-L'], capture_output=True, text=True, timeout=3,
            check=False,
        )
        return result.returncode == 0 and 'GPU ' in result.stdout
    except (OSError, subprocess.TimeoutExpired):
        return False


def _windows_gpu_adapters() -> list[dict[str, str]]:
    """Query Windows display adapters without shell interpolation.

    PowerShell may be disabled by policy. In that case, detection intentionally
    falls back to CPU rather than guessing from the processor architecture.
    """
    if platform.system() != 'Windows':
        return []
    query = ('Get-CimInstance -ClassName Win32_VideoController | '
             'Select-Object Name,PNPDeviceID | ConvertTo-Json -Compress')
    try:
        result = subprocess.run(
            ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', query],
            capture_output=True, text=True, timeout=6, check=False,
        )
        if result.returncode != 0 or len(result.stdout) > 65536:
            return []
        raw = json.loads(result.stdout)
        entries = raw if isinstance(raw, list) else [raw]
        return [entry for entry in entries if isinstance(entry, dict)]
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return []


def _windows_amd_gpu_available() -> bool:
    for adapter in _windows_gpu_adapters():
        name = str(adapter.get('Name') or '').lower()
        identifier = str(adapter.get('PNPDeviceID') or '').lower()
        if any(vendor in name for vendor in ('amd', 'radeon', 'advanced micro devices', 'ati technologies')) or 'ven_1002' in identifier:
            return True
    return False


def _windows_vulkan_loader_available() -> bool:
    """The Vulkan loader is required but does not itself prove GPU support.

    The llama.cpp worker is the final authority: if loading a GPU model fails,
    it retries CPU inference with the *same* Qwen model.
    """
    if platform.system() != 'Windows':
        return False
    try:
        return bool(getattr(ctypes.WinDLL('vulkan-1.dll'), 'vkCreateInstance', None))
    except (AttributeError, OSError):
        return False


@lru_cache(maxsize=1)
def detect_device_profile() -> DeviceProfile:
    system = platform.system()
    machine = platform.machine().lower()
    threads = min(8, max(2, (os.cpu_count() or 4) // 2))
    if system == 'Darwin' and machine in ('arm64', 'aarch64'):
        return DeviceProfile('apple-metal', 'Apple silicon / macOS Metal', -1, threads, 2048, 256, 60,
                             'metal', 'Metal acceleration requested; actual offload requires a Metal-enabled llama-cpp-python build.')
    # A packaged Windows build includes one compiled llama.cpp backend. The
    # Electron launcher supplies that backend from a release manifest; do not
    # request CUDA when a cross-vendor Vulkan wheel was actually bundled.
    packaged_backend = os.getenv('PHISHLAB_BUNDLED_AI_BACKEND', '').lower()
    nvidia = system in ('Linux', 'Windows') and _nvidia_cuda_available()
    if system == 'Windows' and packaged_backend == 'cpu':
        return DeviceProfile('cpu', 'Windows / bundled CPU runtime', 0, threads, 2048, 128, 90,
                             'cpu', 'This installer contains the CPU runtime; GPU acceleration requires a different build.')
    if system == 'Windows' and packaged_backend == 'vulkan':
        if _windows_vulkan_loader_available() and (nvidia or _windows_amd_gpu_available()):
            return DeviceProfile('windows-vulkan', 'Windows / Vulkan-compatible GPU candidate', -1, threads, 2048, 256, 75,
                                 'vulkan', 'Bundled Vulkan runtime selected. Actual GPU offload is confirmed only when Qwen loads.')
        return DeviceProfile('cpu', 'Windows / Vulkan device unavailable', 0, threads, 2048, 128, 90,
                             'cpu', 'The bundled Vulkan runtime will run Qwen on CPU if no usable GPU/driver is available.')
    if nvidia and packaged_backend not in ('vulkan', 'cpu'):
        return DeviceProfile('nvidia-cuda', 'NVIDIA GPU / CUDA-capable host', -1, threads, 2048, 256, 60,
                             'cuda', 'CUDA acceleration requested; the installed llama-cpp-python must support CUDA.')
    if system == 'Windows' and packaged_backend not in ('cuda', 'metal') and _windows_amd_gpu_available():
        if _windows_vulkan_loader_available():
            return DeviceProfile('amd-vulkan', 'AMD Radeon / Windows Vulkan candidate', -1, threads, 2048, 256, 75,
                                 'vulkan', 'AMD display adapter and Vulkan loader detected; GPU offload requires a Vulkan-enabled runtime and usable GPU driver.')
        return DeviceProfile('cpu', 'AMD Radeon / Vulkan loader unavailable', 0, threads, 2048, 128, 90,
                             'cpu', 'Install/update your AMD graphics driver to enable Vulkan; CPU inference is available.')
    return DeviceProfile('cpu', f'{system or "Unknown"} / {machine or "unknown"}', 0, threads, 2048, 128, 90,
                         'cpu', 'CPU-only default; supported even when a GPU is not detected or its runtime is unavailable.')


def _model_available() -> bool:
    path = Path(os.getenv('PHISHLAB_LOCAL_AI_MODEL_PATH', str(_ROOT / 'model' / 'summary-qwen.gguf'))).expanduser()
    return path.is_file() and path.suffix.lower() == '.gguf' 


def _runtime_available() -> bool:
    try:
        return importlib.util.find_spec('llama_cpp') is not None
    except (ImportError, ValueError):
        return False


def read_override() -> dict[str, Any]:
    try:
        data = json.loads(_SETTINGS_FILE.read_text(encoding='utf-8'))
        if isinstance(data, dict) and data.get('mode') == 'manual':
            return validate_override(data)
    except (OSError, ValueError, TypeError):
        pass
    return {'mode': 'auto'}


def validate_override(data: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(data, dict) or data.get('mode') not in ('auto', 'manual'):
        raise ValueError('Mode must be auto or manual')
    if set(data) - {'mode', 'enabled', *_FIELDS}:
        raise ValueError('Unexpected AI configuration field')
    if data['mode'] == 'auto':
        return {'mode': 'auto'}
    if set(data) != {'mode', 'enabled', *_FIELDS}:
        raise ValueError('Manual mode requires all AI configuration values')
    if type(data['enabled']) is not bool:
        raise ValueError('Enabled must be true or false')
    result: dict[str, Any] = {'mode': 'manual', 'enabled': data['enabled']}
    for key, (lo, hi) in _FIELDS.items():
        value = data[key]
        if type(value) is not int or not lo <= value <= hi:
            raise ValueError(f'{key} must be an integer between {lo} and {hi}')
        result[key] = value
    return result


def save_override(data: dict[str, Any]) -> dict[str, Any]:
    validated = validate_override(data)
    with _LOCK:
        target = _SETTINGS_FILE
        temp = target.with_suffix('.json.tmp')
        with temp.open('w', encoding='utf-8') as file:
            json.dump(validated, file, indent=2)
            file.write('\n')
        try:
            os.chmod(temp, 0o600)
        except OSError:
            pass
        temp.replace(target)
    return validated


def resolved_ai_configuration() -> dict[str, Any]:
    profile = detect_device_profile()
    data: dict[str, Any] = {
        'enabled': _model_available() and _runtime_available(),
        'gpu_layers': profile.gpu_layers,
        'threads': profile.threads,
        'context_size': profile.context_size,
        'batch_size': profile.batch_size,
        'generation_timeout_seconds': profile.generation_timeout_seconds,
    }
    env_names = {
        'enabled': 'PHISHLAB_LOCAL_AI_ENABLED',
        'gpu_layers': 'PHISHLAB_LOCAL_AI_GPU_LAYERS',
        'threads': 'PHISHLAB_LOCAL_AI_THREADS',
        'context_size': 'PHISHLAB_LOCAL_AI_CTX_SIZE',
        'batch_size': 'PHISHLAB_LOCAL_AI_BATCH_SIZE',
        'generation_timeout_seconds': 'PHISHLAB_LOCAL_AI_GENERATION_TIMEOUT',
    }
    env_override_keys: list[str] = []
    for key, name in env_names.items():
        raw = os.getenv(name)
        if raw is None:
            continue
        try:
            if key == 'enabled':
                if raw.strip().lower() not in ('0', '1', 'true', 'false', 'yes', 'no', 'on', 'off'):
                    continue
                value: Any = raw.strip().lower() in ('1', 'true', 'yes', 'on')
            else:
                value = int(raw)
                lo, hi = _FIELDS[key]
                value = max(lo, min(hi, value))
            data[key] = value
            env_override_keys.append(key)
        except (ValueError, TypeError):
            pass
    override = read_override()
    if override['mode'] == 'manual':
        data.update({key: value for key, value in override.items() if key != 'mode'})
    return {
        **data,
        'mode': override['mode'], 'detected': asdict(profile),
        'detected_defaults': {
            'enabled': _model_available() and _runtime_available(),
            'gpu_layers': profile.gpu_layers,
            'threads': profile.threads,
            'context_size': profile.context_size,
            'batch_size': profile.batch_size,
            'generation_timeout_seconds': profile.generation_timeout_seconds,
        },
        'environment_overrides': env_override_keys,
    }
