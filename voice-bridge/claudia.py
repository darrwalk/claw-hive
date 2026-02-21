from __future__ import annotations

import logging
from pathlib import Path

from config import WORKSPACE_DIR

logger = logging.getLogger(__name__)

PERSONALITY_FILES = [
    "SOUL.md",
    "IDENTITY.md",
    "USER.md",
]

MEMORY_FILE = "memory.md"


def _read_file(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except (FileNotFoundError, PermissionError):
        logger.warning("Could not read %s", path)
        return None


def _latest_state_of_arnd(memory_dir: Path) -> str | None:
    """Find the most recent state-of-arnd-*.md file."""
    candidates = sorted(memory_dir.glob("state-of-arnd-*.md"), reverse=True)
    if candidates:
        return _read_file(candidates[0])
    return None


def assemble_instructions() -> str:
    """Read workspace files and assemble Claudia's system prompt for voice."""
    workspace = Path(WORKSPACE_DIR)
    sections: list[str] = []

    # Core personality files
    for filename in PERSONALITY_FILES:
        content = _read_file(workspace / filename)
        if content:
            sections.append(content.strip())

    # Memory context
    memory_content = _read_file(workspace / MEMORY_FILE)
    if memory_content:
        sections.append(f"# Current Memory\n\n{memory_content.strip()}")

    # Latest state of Arnd
    memory_dir = workspace / "memory"
    state = _latest_state_of_arnd(memory_dir)
    if state:
        sections.append(f"# Latest State Update\n\n{state.strip()}")

    # Voice-specific instructions
    sections.append(VOICE_ADDENDUM)

    return "\n\n---\n\n".join(sections)


VOICE_ADDENDUM = """\
# Voice Conversation Mode

You are in a real-time voice conversation. Follow these rules:

- Keep responses concise and conversational — this is speech, not text
- Use natural spoken language, avoid markdown formatting or bullet points
- Don't say "asterisk" or describe formatting — just speak naturally
- Match the user's language (German, English, or French)
- If asked to search memory or read files, use the provided tools
- You can express personality, humor, and warmth — you're Claudia having a chat
- For complex questions, give a brief answer first, then offer to elaborate
"""
