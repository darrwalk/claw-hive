"""OpenAI Realtime provider — also covers xAI Grok (same WebSocket protocol)."""
from __future__ import annotations

import json
import logging
from typing import AsyncIterator

import websockets

from config import ProviderConfig
from providers.base import (
    AudioEvent,
    ErrorEvent,
    ProviderEvent,
    ToolCallEvent,
    TranscriptEvent,
    VoiceProvider,
)

logger = logging.getLogger(__name__)


class OpenAIRealtimeProvider(VoiceProvider):
    def __init__(self, config: ProviderConfig) -> None:
        self.config = config
        self._ws: websockets.ClientConnection | None = None

    async def connect(self, instructions: str, tools: list[dict], vad: bool = False) -> None:
        # OpenAI uses ?model= in URL; Grok doesn't (model set in session.update)
        url = self.config.url
        if "openai.com" in url:
            url = f"{url}?model={self.config.model}"

        headers = {"Authorization": f"Bearer {self.config.api_key}"}
        if "openai.com" in self.config.url:
            headers["OpenAI-Beta"] = "realtime=v1"

        self._ws = await websockets.connect(url, additional_headers=headers)

        # Wait for session.created (or handle auth error)
        raw = await self._ws.recv()
        msg = json.loads(raw)
        if msg.get("type") == "error":
            error = msg.get("error", {})
            raise RuntimeError(f"Provider rejected session: {error.get('message', msg)}")
        logger.info("Provider session created: %s", msg.get("type"))

        # Send session configuration
        session_config: dict = {
            "modalities": ["audio", "text"],
            "instructions": instructions,
            "voice": self.config.voice,
            "input_audio_format": "pcm16",
            "output_audio_format": "pcm16",
            "input_audio_transcription": {"model": "whisper-1"},
            "turn_detection": {
                "type": "server_vad",
                "threshold": 0.5,
                "prefix_padding_ms": 300,
                "silence_duration_ms": 700,
            } if vad else None,
        }

        if tools:
            # Convert Chat Completions format to Realtime API format
            session_config["tools"] = [
                {
                    "type": "function",
                    "name": t["function"]["name"],
                    "description": t["function"].get("description", ""),
                    "parameters": t["function"].get("parameters", {}),
                }
                for t in tools
            ]
            session_config["tool_choice"] = "auto"

        # For Grok, include model in session config
        if "x.ai" in self.config.url:
            session_config["model"] = self.config.model

        await self._ws.send(json.dumps({
            "type": "session.update",
            "session": session_config,
        }))

        logger.info("Session configured for %s", self.config.url)

    async def send_audio(self, audio_b64: str) -> None:
        if not self._ws:
            return
        await self._ws.send(json.dumps({
            "type": "input_audio_buffer.append",
            "audio": audio_b64,
        }))

    async def commit_audio(self) -> None:
        if not self._ws:
            return
        await self._ws.send(json.dumps({
            "type": "input_audio_buffer.commit",
        }))
        await self._ws.send(json.dumps({
            "type": "response.create",
        }))

    async def receive(self) -> AsyncIterator[ProviderEvent]:
        if not self._ws:
            return
        try:
            async for raw in self._ws:
                msg = json.loads(raw)
                event_type = msg.get("type", "")

                if event_type in ("response.audio.delta", "response.output_audio.delta"):
                    yield AudioEvent(audio_b64=msg["delta"])

                elif event_type in ("response.audio_transcript.delta", "response.output_audio_transcript.delta"):
                    yield TranscriptEvent(
                        text=msg.get("delta", ""),
                        role="assistant",
                    )

                elif event_type in ("response.audio_transcript.done", "response.output_audio_transcript.done"):
                    yield TranscriptEvent(
                        text=msg.get("transcript", ""),
                        role="assistant",
                        final=True,
                    )

                elif event_type == "conversation.item.input_audio_transcription.completed":
                    yield TranscriptEvent(
                        text=msg.get("transcript", ""),
                        role="user",
                        final=True,
                    )

                elif event_type == "response.function_call_arguments.done":
                    yield ToolCallEvent(
                        call_id=msg.get("call_id", ""),
                        name=msg.get("name", ""),
                        arguments=msg.get("arguments", "{}"),
                    )

                elif event_type == "error":
                    error = msg.get("error", {})
                    yield ErrorEvent(message=error.get("message", str(msg)))

                elif event_type in (
                    "input_audio_buffer.speech_started",
                    "input_audio_buffer.speech_stopped",
                    "response.done",
                    "session.updated",
                    "session.created",
                    "rate_limits.updated",
                    "response.created",
                    "response.output_item.added",
                    "response.output_item.done",
                    "response.content_part.added",
                    "response.content_part.done",
                    "response.output_audio.done",
                    "conversation.item.created",
                    "conversation.item.added",
                    "input_audio_buffer.committed",
                    "ping",
                ):
                    pass  # known events we don't surface
                else:
                    logger.debug("Unhandled event: %s", event_type)

        except websockets.ConnectionClosed:
            logger.info("Provider WebSocket closed")

    async def send_tool_result(self, call_id: str, result: str) -> None:
        if not self._ws:
            return
        await self._ws.send(json.dumps({
            "type": "conversation.item.create",
            "item": {
                "type": "function_call_output",
                "call_id": call_id,
                "output": result,
            },
        }))
        await self._ws.send(json.dumps({"type": "response.create"}))

    async def close(self) -> None:
        if self._ws:
            await self._ws.close()
            self._ws = None
