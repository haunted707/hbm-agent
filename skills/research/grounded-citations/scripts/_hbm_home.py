"""Resolve HBM_HOME for standalone skill scripts.

Skill scripts may run outside the HBM AGENT process (system Python, nix env,
CI) where ``hbm_constants`` is not importable.  This module provides the
same ``get_hbm_home()`` contract without requiring it on ``sys.path``.

When ``hbm_constants`` IS available it is used directly so profile
resolution and any future enhancements are picked up automatically.
"""

from __future__ import annotations

import os
from pathlib import Path

try:
    from hbm_constants import get_hbm_home as get_hbm_home
except (ModuleNotFoundError, ImportError):

    def get_hbm_home() -> Path:
        """Return the HBM AGENT home directory (default: ``~/.hbm``)."""
        val = os.environ.get("HBM_HOME", "").strip()
        return Path(val) if val else Path.home() / ".hbm"
