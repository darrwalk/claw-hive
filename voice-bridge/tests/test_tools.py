"""Tests for tool execution and path safety."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from tools import TOOL_DEFINITIONS, _read_file, _safe_path, _search_memory, execute_tool


class TestToolDefinitions:
    """Validate the canonical TOOL_DEFINITIONS list."""

    def test_all_tools_have_function_format(self) -> None:
        for tool in TOOL_DEFINITIONS:
            assert tool["type"] == "function"
            fn = tool["function"]
            assert "name" in fn
            assert "description" in fn
            assert "parameters" in fn

    def test_tool_names_are_unique(self) -> None:
        names = [t["function"]["name"] for t in TOOL_DEFINITIONS]
        assert len(names) == len(set(names))


class TestSafePath:
    def test_valid_relative_path(self, tmp_workspace: Path) -> None:
        result = _safe_path("memory/state.md")
        assert result is not None
        assert result.is_file()

    def test_blocks_parent_traversal(self, tmp_workspace: Path) -> None:
        assert _safe_path("../../../etc/passwd") is None

    def test_blocks_absolute_escape(self, tmp_workspace: Path) -> None:
        # Even with dots embedded
        assert _safe_path("memory/../../etc/passwd") is None

    def test_workspace_root_is_allowed(self, tmp_workspace: Path) -> None:
        result = _safe_path(".")
        assert result is not None


class TestSearchMemory:
    def test_finds_matching_content(self, tmp_workspace: Path) -> None:
        result = _search_memory("coffee")
        assert "coffee" in result.lower()
        assert "state.md" in result

    def test_case_insensitive(self, tmp_workspace: Path) -> None:
        result = _search_memory("COFFEE")
        assert "coffee" in result.lower()

    def test_no_results(self, tmp_workspace: Path) -> None:
        result = _search_memory("xyznonexistent")
        assert "No results" in result

    def test_searches_top_level_md(self, tmp_workspace: Path) -> None:
        result = _search_memory("Claudia")
        assert "AGENTS.md" in result


class TestReadFile:
    def test_reads_valid_path(self, tmp_workspace: Path) -> None:
        result = _read_file("memory/state.md")
        assert "Arnd likes coffee" in result

    def test_blocks_traversal(self, tmp_workspace: Path) -> None:
        result = _read_file("../../../etc/passwd")
        assert "traversal blocked" in result.lower()

    def test_file_not_found(self, tmp_workspace: Path) -> None:
        result = _read_file("nonexistent.md")
        assert "not found" in result.lower()

    def test_truncates_large_files(self, tmp_workspace: Path) -> None:
        big = tmp_workspace / "big.md"
        big.write_text("x" * 10000)
        result = _read_file("big.md")
        assert "truncated" in result.lower()
        assert len(result) < 9000


@pytest.mark.asyncio
class TestExecuteTool:
    async def test_dispatches_search_memory(self, tmp_workspace: Path) -> None:
        result = await execute_tool("search_memory", json.dumps({"query": "coffee"}))
        assert "coffee" in result.lower()

    async def test_dispatches_read_file(self, tmp_workspace: Path) -> None:
        result = await execute_tool("read_file", json.dumps({"path": "memory/state.md"}))
        assert "Arnd" in result

    async def test_unknown_tool(self) -> None:
        result = await execute_tool("delete_everything", "{}")
        assert "Unknown tool" in result

    async def test_invalid_json(self) -> None:
        result = await execute_tool("search_memory", "not json")
        assert "invalid json" in result.lower()
