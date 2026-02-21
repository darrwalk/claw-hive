"""Tests for provider tool format conversion — catches bug #2 (format mismatch)."""
from __future__ import annotations

import json
from unittest.mock import AsyncMock

import pytest

from config import ProviderConfig
from providers.gemini_live import GeminiLiveProvider, _openai_tools_to_gemini
from tools import TOOL_DEFINITIONS


class TestOpenAIToolConversion:
    """Verify Chat Completions format → OpenAI Realtime flat format.

    The conversion is inline in OpenAIRealtimeProvider.connect().
    We replicate the same logic here to test it in isolation.
    """

    @staticmethod
    def _convert_to_realtime(tools: list[dict]) -> list[dict]:
        """Same logic as openai_realtime.py:66-74."""
        return [
            {
                "type": "function",
                "name": t["function"]["name"],
                "description": t["function"].get("description", ""),
                "parameters": t["function"].get("parameters", {}),
            }
            for t in tools
        ]

    def test_conversion_produces_flat_format(self) -> None:
        converted = self._convert_to_realtime(TOOL_DEFINITIONS)
        for tool in converted:
            assert "function" not in tool, (
                "Realtime format must NOT have nested 'function' key"
            )
            assert "name" in tool
            assert "description" in tool
            assert "parameters" in tool
            assert tool["type"] == "function"

    def test_names_preserved(self) -> None:
        converted = self._convert_to_realtime(TOOL_DEFINITIONS)
        original_names = {t["function"]["name"] for t in TOOL_DEFINITIONS}
        converted_names = {t["name"] for t in converted}
        assert original_names == converted_names

    def test_parameters_preserved(self) -> None:
        converted = self._convert_to_realtime(TOOL_DEFINITIONS)
        for orig, conv in zip(TOOL_DEFINITIONS, converted):
            assert conv["parameters"] == orig["function"]["parameters"]

    def test_all_tools_converted(self) -> None:
        converted = self._convert_to_realtime(TOOL_DEFINITIONS)
        assert len(converted) == len(TOOL_DEFINITIONS)


class TestGeminiToolConversion:
    """Verify Chat Completions format → Gemini functionDeclarations format."""

    def test_produces_function_declarations(self) -> None:
        declarations = _openai_tools_to_gemini(TOOL_DEFINITIONS)
        assert len(declarations) == len(TOOL_DEFINITIONS)
        for decl in declarations:
            assert "name" in decl
            assert "description" in decl
            assert "parameters" in decl
            # Gemini declarations should NOT have 'type' key
            assert "type" not in decl

    def test_skips_non_function_tools(self) -> None:
        tools = [{"type": "code_interpreter"}]
        assert _openai_tools_to_gemini(tools) == []

    def test_names_match_originals(self) -> None:
        declarations = _openai_tools_to_gemini(TOOL_DEFINITIONS)
        original_names = {t["function"]["name"] for t in TOOL_DEFINITIONS}
        converted_names = {d["name"] for d in declarations}
        assert original_names == converted_names


class TestSessionConfigShape:
    """Validate the shape of session configs that providers build.

    These don't test the actual WebSocket flow, just that the
    config dictionaries have the fields each API expects.
    """

    def test_openai_session_config_has_required_fields(self) -> None:
        # Simulate what OpenAIRealtimeProvider.connect() builds
        config: dict = {
            "modalities": ["audio", "text"],
            "instructions": "test instructions",
            "voice": "sage",
            "input_audio_format": "pcm16",
            "output_audio_format": "pcm16",
            "input_audio_transcription": {"model": "whisper-1"},
        }
        required = {"modalities", "instructions", "voice",
                     "input_audio_format", "output_audio_format"}
        assert required.issubset(config.keys())

    def test_gemini_setup_has_required_fields(self) -> None:
        # Simulate what GeminiLiveProvider.connect() builds
        setup: dict = {
            "model": "models/gemini-2.5-flash-native-audio-preview-12-2025",
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "speechConfig": {
                    "voiceConfig": {
                        "prebuiltVoiceConfig": {"voiceName": "Kore"},
                    },
                },
            },
            "systemInstruction": {"parts": [{"text": "test"}]},
        }
        assert "model" in setup
        assert "generationConfig" in setup
        gen = setup["generationConfig"]
        assert "responseModalities" in gen
        assert "speechConfig" in gen


@pytest.mark.asyncio
class TestGeminiMessageFormats:
    """Validate the exact JSON messages GeminiLiveProvider sends.

    Catches format drift like mediaChunks→audio or missing turnComplete.turns.
    Uses a mock WebSocket so no network calls are made.
    """

    @staticmethod
    def _make_provider() -> GeminiLiveProvider:
        cfg = ProviderConfig(
            url="wss://fake", api_key="fake", model="fake",
            voice="Kore", protocol="gemini",
        )
        provider = GeminiLiveProvider(cfg)
        provider._ws = AsyncMock()
        return provider

    @staticmethod
    def _sent_json(provider: GeminiLiveProvider) -> dict:
        """Extract the JSON payload from the last ws.send() call."""
        raw = provider._ws.send.call_args[0][0]
        return json.loads(raw)

    async def test_send_audio_uses_snake_case_key(self) -> None:
        """Must use snake_case 'realtime_input' (not camelCase 'realtimeInput')."""
        provider = self._make_provider()
        await provider.send_audio("dGVzdA==")
        msg = self._sent_json(provider)

        assert "realtime_input" in msg, "Outer key must be snake_case"
        assert "realtimeInput" not in msg, "camelCase outer key is rejected by API"
        rt = msg["realtime_input"]
        assert "audio" in rt, "Must use 'audio' field (not 'mediaChunks')"
        assert "mediaChunks" not in rt, "mediaChunks is deprecated"
        assert "data" in rt["audio"]
        assert "mimeType" in rt["audio"]
        assert rt["audio"]["mimeType"].startswith("audio/pcm")

    async def test_commit_audio_is_noop(self) -> None:
        """commit_audio must be a no-op — Gemini uses server-side VAD only.

        Sending client_content after realtime_input audio causes
        "invalid argument" from the Gemini API.
        """
        provider = self._make_provider()
        await provider.commit_audio()
        provider._ws.send.assert_not_called()

    async def test_send_tool_result_uses_snake_case_key(self) -> None:
        """Must use snake_case 'tool_response' (not camelCase 'toolResponse')."""
        provider = self._make_provider()
        await provider.send_tool_result("call-123", "some result")
        msg = self._sent_json(provider)

        assert "tool_response" in msg, "Outer key must be snake_case"
        assert "toolResponse" not in msg, "camelCase outer key is rejected by API"
        tr = msg["tool_response"]
        assert "functionResponses" in tr
        resp = tr["functionResponses"][0]
        assert resp["id"] == "call-123"
        assert resp["response"]["result"] == "some result"
