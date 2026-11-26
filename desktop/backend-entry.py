"""Frozen backend entry point for Electron builds (no public network listener)."""
from __future__ import annotations

import multiprocessing
import os


def main() -> None:
    multiprocessing.freeze_support()
    port = int(os.environ.get("PHISHLAB_DESKTOP_PORT", "0"))
    if not (1024 <= port <= 65535):
        raise SystemExit("A valid desktop loopback port is required.")
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=port, access_log=False)


if __name__ == "__main__":
    main()
