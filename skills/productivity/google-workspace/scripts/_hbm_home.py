"""Resolve HBM_HOME for standalone skill scripts.

Skill scripts may run outside the HBM AGENT process (e.g. system Python,
nix env, CI) where ``hbm_constants`` is not importable.  This module
provides the same ``get_hbm_home()`` and ``display_hbm_home()``
contracts as ``hbm_constants`` without requiring it on ``sys.path``.

When ``hbm_constants`` IS available it is used directly so that any
future enhancements (profile resolution, Docker detection, etc.) are
picked up automatically.  The fallback path replicates the core logic
from ``hbm_constants.py`` using only the stdlib.

All scripts under ``google-workspace/scripts/`` should import from here
instead of duplicating the ``HBM_HOME = Path(os.getenv(...))`` pattern.
"""

from __future__ import annotations

import os
from pathlib import Path

try:
    from hbm_constants import display_hbm_home as display_hbm_home
    from hbm_constants import get_hbm_home as get_hbm_home
except (ModuleNotFoundError, ImportError):

    def get_hbm_home() -> Path:
        """Return the HBM AGENT home directory (default: ~/.hbm).

        Mirrors ``hbm_constants.get_hbm_home()``."""
        val = os.environ.get("HBM_HOME", "").strip()
        return Path(val) if val else Path.home() / ".hbm"

    def display_hbm_home() -> str:
        """Return a user-friendly ``~/``-shortened display string.

        Mirrors ``hbm_constants.display_hbm_home()``."""
        home = get_hbm_home()
        try:
            return "~/" + home.relative_to(Path.home()).as_posix()
        except ValueError:
            return str(home)
