"""Build a platform-specific standalone backend for electron-builder.

Run inside the already configured backend virtual environment. Any native
llama-cpp-python wheel is packaged from that environment, so build natively
on macOS/Windows/Linux; do not cross-compile.
"""
from __future__ import annotations
import importlib.util
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    if importlib.util.find_spec("PyInstaller") is None:
        raise SystemExit("Install PyInstaller in your backend venv first: python -m pip install pyinstaller")
    if importlib.util.find_spec("fastapi") is None or importlib.util.find_spec("uvicorn") is None:
        raise SystemExit("Install backend/requirements.txt in this Python environment before packaging.")
    if importlib.util.find_spec("sqlalchemy") is None:
        raise SystemExit("Install backend/requirements-history.txt before packaging; SQLite scan history needs SQLAlchemy.")
    # Google OAuth is required by Gmail even when the classifier/demo still work.
    # PyInstaller can otherwise succeed while excluding dynamically imported OAuth modules.
    for module in ("google_auth_oauthlib", "googleapiclient", "google.auth", "google.oauth2", "requests_oauthlib"):
        try:
            available = importlib.util.find_spec(module) is not None
        except ModuleNotFoundError:
            available = False
        if not available:
            raise SystemExit(f"Gmail dependency {module} is missing from the build environment. Install backend/requirements-history.txt in this Python environment, then rebuild.")
    cmd = [sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--onedir", "--name", "phislab-backend",
           "--distpath", str(ROOT / "desktop" / "dist-backend"),
           "--workpath", str(ROOT / "desktop" / "build-backend"),
           "--specpath", str(ROOT / "desktop" / "build-backend"),
           "--paths", str(ROOT / "backend"),
           "--hidden-import", "app.main", "--collect-submodules", "uvicorn",
           "--collect-all", "sklearn", "--collect-all", "scipy",
           "--collect-submodules", "googleapiclient", "--collect-all", "google_auth_oauthlib",
           "--collect-submodules", "google.auth", "--collect-submodules", "google.oauth2",
           "--collect-submodules", "requests_oauthlib", "--collect-submodules", "oauthlib",
           "--collect-submodules", "sqlalchemy", "--collect-submodules", "pymysql"]
    if importlib.util.find_spec("llama_cpp") is not None:
        cmd += ["--collect-all", "llama_cpp"]
    cmd += [str(ROOT / "desktop" / "backend-entry.py")]
    subprocess.run(cmd, cwd=ROOT, check=True)
    print("Bundled backend in desktop/dist-backend/phislab-backend")
    print("Classifier, Qwen GGUF, Gmail credentials, and database are intentionally NOT bundled.")


if __name__ == "__main__":
    main()
