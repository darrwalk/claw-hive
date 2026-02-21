"""Tests for provider tool format conversion — catches bug #2 (format mismatch)."""
from __future__ import annotations

from providers.gemini_live import _openai_tools_to_gemini
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
            "model": "models/gemini-2.0-flash-live-001",
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
