"""Shared fixtures for voice-bridge tests."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

# voice-bridge uses bare imports (e.g. `from config import ...`),
# so we need the package root on sys.path.
VOICE_BRIDGE_ROOT = Path(__file__).resolve().parent.parent
if str(VOICE_BRIDGE_ROOT) not in sys.path:
    sys.path.insert(0, str(VOICE_BRIDGE_ROOT))


@pytest.fixture()
def tmp_workspace(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Create a temporary workspace with sample memory files."""
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    # Top-level markdown (searched by _search_memory)
    (workspace / "AGENTS.md").write_text("# Agents\nClaudia is the primary agent.\n")

    # Memory sub-directory
    memory = workspace / "memory"
    memory.mkdir()
    (memory / "state.md").write_text(
        "# State\nArnd likes coffee.\nCurrent project: voice-bridge.\n"
    )
    (memory / "prefs.md").write_text("# Preferences\nTimezone: Europe/Berlin\n")

    # Patch WORKSPACE_DIR everywhere it's been imported
    monkeypatch.setenv("WORKSPACE_DIR", str(workspace))
    monkeypatch.setattr("config.WORKSPACE_DIR", str(workspace))
    monkeypatch.setattr("tools.WORKSPACE_DIR", str(workspace))

    return workspace


@pytest.fixture()
def provider_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Set dummy API keys so all providers appear available."""
    monkeypatch.setenv("XAI_API_KEY", "test-xai-key")
    monkeypatch.setenv("OPENAI_API_KEY", "test-openai-key")
    monkeypatch.setenv("GOOGLE_API_KEY", "test-google-key")
