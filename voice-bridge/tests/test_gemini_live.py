"""Integration tests for Gemini Live API — requires GOOGLE_API_KEY.

These tests hit the real Gemini WebSocket API. They validate that our
message formats are actually accepted, catching issues that unit tests
with mocked WebSockets cannot detect.

Run: pytest tests/test_gemini_live.py -v -m integration
"""
from __future__ import annotations

import asyncio
import base64
import json
import os
import struct

import pytest
import websockets

from config import ProviderConfig
from providers.base import AudioEvent, TranscriptEvent
from providers.gemini_live import GeminiLiveProvider

testmark = pytest.mark.integration

GEMINI_URL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
MODEL = "gemini-2.5-flash-native-audio-preview-12-2025"


def _api_key() -> str:
    key = os.getenv("GOOGLE_API_KEY", "")
    if not key:
        pytest.skip("GOOGLE_API_KEY not set")
    return key


def _silence_b64(duration_ms: int = 200, sample_rate: int = 16000) -> str:
    """Generate base64-encoded silent PCM16 audio."""
    n_samples = int(sample_rate * duration_ms / 1000)
    pcm = struct.pack(f"<{n_samples}h", *([0] * n_samples))
    return base64.b64encode(pcm).decode()


async def _connect_and_setup(
    key: str,
    instructions: str = "You are a helpful assistant.",
) -> websockets.ClientConnection:
    """Open a Gemini WebSocket and send setup, return the connection."""
    url = f"{GEMINI_URL}?key={key}"
    ws = await websockets.connect(url)
    setup = {
        "setup": {
            "model": f"models/{MODEL}",
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "speechConfig": {
                    "voiceConfig": {
                        "prebuiltVoiceConfig": {"voiceName": "Kore"},
                    },
                },
            },
            "systemInstruction": {
                "parts": [{"text": instructions}],
            },
        }
    }
    await ws.send(json.dumps(setup))
    raw = await ws.recv()
    msg = json.loads(raw)
    assert "setupComplete" in msg, f"Expected setupComplete, got: {list(msg.keys())}"
    return ws


@testmark
@pytest.mark.asyncio
class TestGeminiConnect:
    """Verify we can connect and complete setup handshake."""

    async def test_connect_and_setup(self) -> None:
        key = _api_key()
        async with asyncio.timeout(15):
            ws = await _connect_and_setup(key)
            await ws.close()


@testmark
@pytest.mark.asyncio
class TestGeminiAudio:
    """Verify audio message formats are accepted."""

    async def test_send_audio_accepted(self) -> None:
        """Send audio chunks with snake_case keys — must not error/disconnect."""
        key = _api_key()
        async with asyncio.timeout(15):
            ws = await _connect_and_setup(key)
            silence = _silence_b64(200)
            for _ in range(3):
                await ws.send(json.dumps({
                    "realtime_input": {
                        "audio": {
                            "data": silence,
                            "mimeType": "audio/pcm;rate=16000",
                        },
                    },
                }))
                await asyncio.sleep(0.05)
            # Connection should still be alive
            # Verify connection still alive by sending one more chunk
            await ws.send(json.dumps({
                "realtime_input": {
                    "audio": {
                        "data": silence,
                        "mimeType": "audio/pcm;rate=16000",
                    },
                },
            }))
            await ws.close()

    async def test_commit_is_noop_keeps_connection(self) -> None:
        """After audio, NOT sending client_content keeps connection alive.

        This documents that Gemini's native audio relies on server-side VAD
        and does not need (or want) a client-side turn commit.
        """
        key = _api_key()
        async with asyncio.timeout(15):
            ws = await _connect_and_setup(key)
            silence = _silence_b64(500)
            await ws.send(json.dumps({
                "realtime_input": {
                    "audio": {
                        "data": silence,
                        "mimeType": "audio/pcm;rate=16000",
                    },
                },
            }))
            # Wait a bit — no commit sent
            await asyncio.sleep(1)
            # Verify connection still alive by sending another chunk
            await ws.send(json.dumps({
                "realtime_input": {
                    "audio": {
                        "data": silence,
                        "mimeType": "audio/pcm;rate=16000",
                    },
                },
            }))
            await ws.close()


@testmark
@pytest.mark.asyncio
class TestGeminiText:
    """Verify text-mode client_content works (without prior audio)."""

    async def test_text_turn_gets_response(self) -> None:
        """Send a text turn via client_content — should get serverContent back."""
        key = _api_key()
        async with asyncio.timeout(30):
            ws = await _connect_and_setup(key)
            await ws.send(json.dumps({
                "client_content": {
                    "turns": [{
                        "role": "user",
                        "parts": [{"text": "Say hello in one word."}],
                    }],
                    "turnComplete": True,
                },
            }))
            # Read messages until we get serverContent
            got_content = False
            for _ in range(50):
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=5)
                except asyncio.TimeoutError:
                    break
                msg = json.loads(raw)
                if "serverContent" in msg:
                    got_content = True
                    if msg["serverContent"].get("turnComplete"):
                        break
            assert got_content, "Expected serverContent response to text turn"
            await ws.close()


@testmark
@pytest.mark.asyncio
class TestGeminiModeConstraints:
    """Document the constraint: mixing audio + client_content crashes."""

    async def test_audio_then_client_content_rejected(self) -> None:
        """Sending client_content after realtime_input audio should fail.

        This test documents the API constraint that drove the commit_audio
        no-op fix. If Gemini ever relaxes this constraint, this test will
        start passing differently and should be updated.
        """
        key = _api_key()
        async with asyncio.timeout(15):
            ws = await _connect_and_setup(key)
            # Send audio first
            silence = _silence_b64(200)
            await ws.send(json.dumps({
                "realtime_input": {
                    "audio": {
                        "data": silence,
                        "mimeType": "audio/pcm;rate=16000",
                    },
                },
            }))
            await asyncio.sleep(0.1)
            # Now send client_content — this should cause an error
            await ws.send(json.dumps({
                "client_content": {
                    "turns": [],
                    "turnComplete": True,
                },
            }))
            # Read messages — expect error or disconnect
            got_error = False
            for _ in range(10):
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=3)
                    msg = json.loads(raw)
                    # Check for error indicators
                    if any(k in str(msg).lower() for k in ("error", "invalid")):
                        got_error = True
                        break
                except (websockets.ConnectionClosed, asyncio.TimeoutError):
                    got_error = True
                    break
            assert got_error, (
                "Expected error/disconnect when mixing audio + client_content"
            )
            try:
                await ws.close()
            except websockets.ConnectionClosed:
                pass


def _provider_config() -> ProviderConfig:
    key = _api_key()
    return ProviderConfig(
        url=GEMINI_URL,
        api_key=key,
        model=MODEL,
        voice="Kore",
        protocol="gemini",
    )


@testmark
@pytest.mark.asyncio
class TestGeminiProviderReceive:
    """Verify the full provider receive chain: real API → receive() → events.

    These tests use GeminiLiveProvider directly (not raw WebSocket) to catch
    parsing bugs in the receive() method that raw-WS tests miss.
    """

    async def test_text_turn_emits_final_transcript_event(self) -> None:
        """Send text turn via provider → must get AudioEvent + TranscriptEvent(final=True).

        This is the assertion that would have caught the 'Processing...' bug:
        if receive() fails to emit a final TranscriptEvent, the UI hangs.
        """
        config = _provider_config()
        provider = GeminiLiveProvider(config)

        async with asyncio.timeout(30):
            await provider.connect(
                instructions="Reply in one word only.",
                tools=[],
            )

            # Send text turn via raw WS (provider has no send_text method)
            assert provider._ws is not None
            await provider._ws.send(json.dumps({
                "client_content": {
                    "turns": [{
                        "role": "user",
                        "parts": [{"text": "Say hello."}],
                    }],
                    "turnComplete": True,
                },
            }))

            got_audio = False
            got_final_transcript = False

            async for event in provider.receive():
                if isinstance(event, AudioEvent):
                    got_audio = True
                elif isinstance(event, TranscriptEvent) and event.final:
                    got_final_transcript = True
                    break

            assert got_audio, "Expected at least one AudioEvent from provider.receive()"
            assert got_final_transcript, (
                "Expected TranscriptEvent(final=True) — absence causes 'Processing...' bug"
            )

            await provider.close()
