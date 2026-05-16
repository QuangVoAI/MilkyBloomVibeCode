#!/usr/bin/env python3
"""
Wait for Qdrant to become ready, then seed policy docs into it.

Used by Render initialDeployHook so retrieval has real policy data
as soon as the agentic service comes online.
"""
from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path
from urllib.error import URLError, HTTPError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
PYTHON_DIR = ROOT / "python"

if str(PYTHON_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_DIR))

from config import QDRANT_URL  # noqa: E402
from utils.console import console  # noqa: E402


def _readyz_url() -> str:
    base = (QDRANT_URL or "").rstrip("/")
    if not base:
        return ""
    return f"{base}/readyz"


def _wait_for_qdrant(timeout_seconds: int = 120, poll_seconds: int = 5) -> bool:
    readyz = _readyz_url()
    if not readyz:
        console.print("[yellow]⚠️ QDRANT_URL is empty; skipping bootstrap.[/]")
        return False

    deadline = time.time() + timeout_seconds
    last_error: str | None = None

    while time.time() < deadline:
        try:
            with urlopen(readyz, timeout=5) as response:
                if 200 <= getattr(response, "status", 200) < 300:
                    console.print(f"[green]✅ Qdrant ready at {readyz}[/]")
                    return True
        except (HTTPError, URLError, TimeoutError, OSError) as exc:
            last_error = str(exc)
            console.print(
                f"[dim]Waiting for Qdrant... ({poll_seconds}s) last error: {last_error}[/]"
            )
            time.sleep(poll_seconds)

    console.print(
        f"[yellow]⚠️ Qdrant was not ready after {timeout_seconds}s. "
        f"Last error: {last_error or 'unknown'}[/]"
    )
    return False


def main() -> int:
    if not _wait_for_qdrant():
        return 0

    console.print("[cyan]Seeding policy documents into Qdrant...[/]")
    result = subprocess.run(
        [sys.executable, "seed_qdrant_policies.py", "--recreate"],
        cwd=str(PYTHON_DIR),
        check=False,
    )
    if result.returncode != 0:
        console.print(
            f"[yellow]⚠️ Qdrant seeding finished with code {result.returncode}[/]"
        )
        return result.returncode

    console.print("[green]✅ Qdrant bootstrap complete[/]")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
