"""Tests for the Nous-HBM AGENT-3/4 non-agentic warning detector.

Prior to this check, the warning fired on any model whose name contained
``"hbm"`` anywhere (case-insensitive). That false-positived on unrelated
local Modelfiles such as ``hbm-brain:qwen3-14b-ctx16k`` — a tool-capable
Qwen3 wrapper that happens to live under the "hbm" tag namespace.

``is_nous_hbm_non_agentic`` should only match the actual Nous Research
HBM AGENT-3 / HBM AGENT-4 chat family.
"""

from __future__ import annotations

import pytest

from hbm_cli.model_switch import (
    _HBM_MODEL_WARNING,
    _check_hbm_model_warning,
    is_nous_hbm_non_agentic,
)


@pytest.mark.parametrize(
    "model_name",
    [
        "NousResearch/HBM AGENT-3-Llama-3.1-70B",
        "NousResearch/HBM AGENT-3-Llama-3.1-405B",
        "hbm-3",
        "HBM AGENT-3",
        "hbm-4",
        "hbm-4-405b",
        "hbm_4_70b",
        "openrouter/hbm3:70b",
        "openrouter/nousresearch/hbm-4-405b",
        "NousResearch/HBM AGENT3",
        "hbm-3.1",
    ],
)
def test_matches_real_nous_hbm_chat_models(model_name: str) -> None:
    assert is_nous_hbm_non_agentic(model_name), (
        f"expected {model_name!r} to be flagged as Nous HBM AGENT 3/4"
    )
    assert _check_hbm_model_warning(model_name) == _HBM_MODEL_WARNING


