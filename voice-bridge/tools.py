"""Tool definitions and execution for Claudia's voice sessions."""
from __future__ import annotations

import json
import logging
from pathlib import Path

from config import WORKSPACE_DIR

logger = logging.getLogger(__name__)

# OpenAI function tool format (Gemini adapter converts as needed)
TOOL_DEFINITIONS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "search_memory",
            "description": "Search Claudia's memory files for information about a topic. Use when the user asks about something you might have notes on.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query — keywords or topic to find in memory files",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read a specific file from the workspace. Use for reading notes, documents, or configuration.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Relative path within the workspace (e.g., 'memory/state-of-arnd-2026-02.md')",
                    },
                },
                "required": ["path"],
            },
        },
    },
]


def _safe_path(relative: str) -> Path | None:
    """Resolve path within workspace, blocking traversal."""
    workspace = Path(WORKSPACE_DIR).resolve()
    resolved = (workspace / relative).resolve()
    if not str(resolved).startswith(str(workspace) + "/") and resolved != workspace:
        return None
    return resolved


def _search_memory(query: str) -> str:
    """Simple keyword search across memory files."""
    workspace = Path(WORKSPACE_DIR)
    memory_dir = workspace / "memory"
    query_lower = query.lower()
    results: list[str] = []

    # Search memory directory
    search_dirs = [memory_dir, workspace]
    seen: set[Path] = set()

    for search_dir in search_dirs:
        if not search_dir.is_dir():
            continue
        glob_pattern = "*.md" if search_dir == workspace else "**/*.md"
        for md_file in search_dir.glob(glob_pattern):
            if md_file in seen or not md_file.is_file():
                continue
            seen.add(md_file)
            try:
                content = md_file.read_text(encoding="utf-8")
                if query_lower in content.lower():
                    # Extract relevant snippet (first matching paragraph)
                    lines = content.split("\n")
                    snippets: list[str] = []
                    for i, line in enumerate(lines):
                        if query_lower in line.lower():
                            start = max(0, i - 1)
                            end = min(len(lines), i + 3)
                            snippets.append("\n".join(lines[start:end]))
                            if len(snippets) >= 2:
                                break
                    rel = md_file.relative_to(workspace)
                    results.append(f"**{rel}**:\n" + "\n...\n".join(snippets))
            except (PermissionError, UnicodeDecodeError):
                continue

    if not results:
        return f"No results found for '{query}' in memory files."
    return "\n\n---\n\n".join(results[:5])


def _read_file(path: str) -> str:
    """Read a workspace file with path validation."""
    resolved = _safe_path(path)
    if not resolved:
        return "Error: invalid path (traversal blocked)."
    if not resolved.is_file():
        return f"Error: file not found: {path}"
    try:
        content = resolved.read_text(encoding="utf-8")
        if len(content) > 8000:
            return content[:8000] + "\n\n[truncated — file too long for voice context]"
        return content
    except (PermissionError, UnicodeDecodeError) as e:
        return f"Error reading file: {e}"


async def execute_tool(name: str, arguments: str) -> str:
    """Execute a tool call and return the result string."""
    try:
        args = json.loads(arguments)
    except json.JSONDecodeError:
        return f"Error: invalid JSON arguments: {arguments}"

    if name == "search_memory":
        return _search_memory(args.get("query", ""))
    elif name == "read_file":
        return _read_file(args.get("path", ""))
    else:
        return f"Unknown tool: {name}"
