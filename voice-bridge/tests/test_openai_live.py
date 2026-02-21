"""Integration tests for OpenAI/Grok Realtime API — requires API keys.

These tests hit the real OpenAI/Grok WebSocket API to validate our
session setup and tool format are accepted.

Run: pytest tests/test_openai_live.py -v -m integration
"""
from __future__ import annotations

import asyncio
import json
import os

import pytest
import websockets

from tools import TOOL_DEFINITIONS

testmark = pytest.mark.integration

# Grok is cheaper — use as default integration target
GROK_URL = "wss://api.x.ai/v1/realtime"
GROK_MODEL = "grok-3-fast"
OPENAI_URL = "wss://api.openai.com/v1/realtime"
OPENAI_MODEL = "gpt-4o-realtime-preview"


def _grok_key() -> str:
    key = os.getenv("XAI_API_KEY", "")
    if not key:
        pytest.skip("XAI_API_KEY not set")
    return key


def _openai_key() -> str:
    key = os.getenv("OPENAI_API_KEY", "")
    if not key:
        pytest.skip("OPENAI_API_KEY not set")
    return key


def _convert_tools(tools: list[dict]) -> list[dict]:
    """Same conversion as openai_realtime.py — Chat Completions → Realtime."""
    return [
        {
            "type": "function",
            "name": t["function"]["name"],
            "description": t["function"].get("description", ""),
            "parameters": t["function"].get("parameters", {}),
        }
        for t in tools
    ]


async def _connect_grok(key: str) -> websockets.ClientConnection:
    """Connect to Grok Realtime API."""
    headers = {"Authorization": f"Bearer {key}"}
    ws = await websockets.connect(GROK_URL, additional_headers=headers)
    raw = await ws.recv()
    msg = json.loads(raw)
    if msg.get("type") == "error":
        raise RuntimeError(f"Grok rejected: {msg}")
    assert msg.get("type") == "session.created", f"Unexpected: {msg.get('type')}"
    return ws


async def _connect_openai(key: str) -> websockets.ClientConnection:
    """Connect to OpenAI Realtime API."""
    url = f"{OPENAI_URL}?model={OPENAI_MODEL}"
    headers = {
        "Authorization": f"Bearer {key}",
        "OpenAI-Beta": "realtime=v1",
    }
    ws = await websockets.connect(url, additional_headers=headers)
    raw = await ws.recv()
    msg = json.loads(raw)
    if msg.get("type") == "error":
        raise RuntimeError(f"OpenAI rejected: {msg}")
    assert msg.get("type") == "session.created", f"Unexpected: {msg.get('type')}"
    return ws


@testmark
@pytest.mark.asyncio
class TestGrokConnect:
    """Verify Grok connection and session setup."""

    async def test_connect_and_setup(self) -> None:
        key = _grok_key()
        async with asyncio.timeout(15):
            ws = await _connect_grok(key)
            await ws.close()

    async def test_tool_format_accepted(self) -> None:
        """Send session.update with converted tools — must get session.updated."""
        key = _grok_key()
        async with asyncio.timeout(15):
            ws = await _connect_grok(key)
            session_config = {
                "modalities": ["audio", "text"],
                "instructions": "You are a test assistant.",
                "voice": "Sage",
                "model": GROK_MODEL,
                "input_audio_format": "pcm16",
                "output_audio_format": "pcm16",
                "tools": _convert_tools(TOOL_DEFINITIONS),
                "tool_choice": "auto",
            }
            await ws.send(json.dumps({
                "type": "session.update",
                "session": session_config,
            }))
            # Read until session.updated or error
            got_updated = False
            for _ in range(10):
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=5)
                except asyncio.TimeoutError:
                    break
                msg = json.loads(raw)
                if msg.get("type") == "session.updated":
                    got_updated = True
                    break
                if msg.get("type") == "error":
                    pytest.fail(f"Tool format rejected: {msg}")
            assert got_updated, "Expected session.updated after tool config"
            await ws.close()


@testmark
@pytest.mark.asyncio
class TestOpenAIConnect:
    """Verify OpenAI Realtime connection and session setup."""

    async def test_connect_and_setup(self) -> None:
        key = _openai_key()
        async with asyncio.timeout(15):
            ws = await _connect_openai(key)
            await ws.close()

    async def test_tool_format_accepted(self) -> None:
        """Send session.update with converted tools — must get session.updated."""
        key = _openai_key()
        async with asyncio.timeout(15):
            ws = await _connect_openai(key)
            session_config = {
                "modalities": ["audio", "text"],
                "instructions": "You are a test assistant.",
                "voice": "sage",
                "input_audio_format": "pcm16",
                "output_audio_format": "pcm16",
                "input_audio_transcription": {"model": "whisper-1"},
                "tools": _convert_tools(TOOL_DEFINITIONS),
                "tool_choice": "auto",
            }
            await ws.send(json.dumps({
                "type": "session.update",
                "session": session_config,
            }))
            got_updated = False
            for _ in range(10):
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=5)
                except asyncio.TimeoutError:
                    break
                msg = json.loads(raw)
                if msg.get("type") == "session.updated":
                    got_updated = True
                    break
                if msg.get("type") == "error":
                    pytest.fail(f"Tool format rejected: {msg}")
            assert got_updated, "Expected session.updated after tool config"
            await ws.close()
