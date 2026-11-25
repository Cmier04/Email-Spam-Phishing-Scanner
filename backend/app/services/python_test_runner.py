"""Developer-only, allowlisted unittest execution for the local desktop UI.

Not a shell. Only statically discovered project tests may be selected; no
paths, command-line arguments, or code supplied by the browser are evaluated.
"""
from __future__ import annotations

import ast
import os
from pathlib import Path
import subprocess
import sys
from threading import Lock
from time import perf_counter

_ROOT = Path(__file__).resolve().parents[2]
_TESTS = _ROOT / 'tests'
_RUN_LOCK = Lock()
_OUTPUT_LIMIT = 20000


def testing_allowed(host: str) -> bool:
    return (os.getenv('PHISHLAB_ENABLE_TEST_RUNNER', '0') == '1'
            and host in ('127.0.0.1', '::1', 'localhost'))


def list_tests() -> list[dict]:
    if not _TESTS.is_dir():
        return []
    entries: list[dict] = []
    for path in sorted(_TESTS.glob('test_*.py')):
        if not path.is_file() or path.is_symlink():
            continue
        try:
            syntax = ast.parse(path.read_text(encoding='utf-8'), filename=path.name)
        except (SyntaxError, OSError, UnicodeError):
            continue
        methods: list[dict] = []
        for node in syntax.body:
            if isinstance(node, ast.ClassDef):
                for method in node.body:
                    if isinstance(method, (ast.FunctionDef, ast.AsyncFunctionDef)) and method.name.startswith('test_'):
                        methods.append({'id': f'{path.name}::{node.name}.{method.name}', 'name': f'{node.name}.{method.name}'})
            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name.startswith('test_'):
                # File runs remain available for pytest-style tests, if present.
                pass
        entries.append({'id': path.name, 'name': path.name, 'functions': methods})
    return entries


def run_test(test_id: str) -> dict:
    selected = None
    for file in list_tests():
        if test_id == file['id']:
            selected = ('file', file['id'])
            break
        if any(method['id'] == test_id for method in file['functions']):
            selected = ('method', test_id)
            break
    if selected is None:
        raise ValueError('Select a Python test from the discovered list.')
    if not _RUN_LOCK.acquire(blocking=False):
        raise RuntimeError('Another Python test is running.')
    try:
        kind, value = selected
        if kind == 'file':
            command = [sys.executable, '-m', 'unittest', 'discover', '-s', 'tests', '-p', value, '-v']
        else:
            filename, function = value.split('::', 1)
            command = [sys.executable, '-m', 'unittest', f'{Path(filename).stem}.{function}', '-v']
        environment = os.environ.copy()
        environment['PYTHONPATH'] = os.pathsep.join((str(_ROOT), str(_TESTS), environment.get('PYTHONPATH', '')))
        start = perf_counter()
        try:
            completed = subprocess.run(command, cwd=_ROOT, env=environment, text=True,
                                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                       timeout=90, check=False)
            output = completed.stdout[-_OUTPUT_LIMIT:]
            status = 'passed' if completed.returncode == 0 else 'failed'
        except subprocess.TimeoutExpired as exc:
            output = (exc.stdout or b'')
            if isinstance(output, bytes):
                output = output.decode('utf-8', 'replace')
            output = output[-_OUTPUT_LIMIT:] + '\nTest execution exceeded 90 seconds.'
            status = 'timeout'
        return {'test_id': test_id, 'status': status, 'output': output,
                'duration_ms': round((perf_counter() - start) * 1000),
                'truncated': len(output) >= _OUTPUT_LIMIT}
    finally:
        _RUN_LOCK.release()
