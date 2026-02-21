"""Google Gemini Live provider — different protocol from OpenAI."""
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


def _openai_tools_to_gemini(tools: list[dict]) -> list[dict]:
    """Convert OpenAI function tool format to Gemini function declarations."""
    declarations = []
    for tool in tools:
        if tool.get("type") != "function":
            continue
        fn = tool["function"]
        declarations.append({
            "name": fn["name"],
            "description": fn.get("description", ""),
            "parameters": fn.get("parameters", {}),
        })
    return declarations


class GeminiLiveProvider(VoiceProvider):
    def __init__(self, config: ProviderConfig) -> None:
        self.config = config
        self._ws: websockets.ClientConnection | None = None

    async def connect(self, instructions: str, tools: list[dict], vad: bool = False) -> None:
        model = self.config.model
        url = f"{self.config.url}?key={self.config.api_key}"

        self._ws = await websockets.connect(url)

        # Build setup message
        setup: dict = {
            "model": f"models/{model}",
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "speechConfig": {
                    "voiceConfig": {
                        "prebuiltVoiceConfig": {
                            "voiceName": self.config.voice,
                        }
                    }
                },
            },
            "systemInstruction": {
                "parts": [{"text": instructions}],
            },
        }

        if tools:
            gemini_fns = _openai_tools_to_gemini(tools)
            if gemini_fns:
                setup["tools"] = [{"functionDeclarations": gemini_fns}]

        await self._ws.send(json.dumps({"setup": setup}))

        # Wait for setupComplete
        raw = await self._ws.recv()
        msg = json.loads(raw)
        if "setupComplete" in msg:
            logger.info("Gemini session ready")
        else:
            logger.warning("Unexpected first message: %s", list(msg.keys()))

    async def send_audio(self, audio_b64: str) -> None:
        if not self._ws:
            return
        await self._ws.send(json.dumps({
            "realtime_input": {
                "audio": {
                    "data": audio_b64,
                    "mimeType": "audio/pcm;rate=16000",
                },
            },
        }))

    async def commit_audio(self) -> None:
        # No-op: Gemini native audio uses server-side VAD for turn detection.
        # Sending client_content after realtime_input audio causes "invalid argument".
        logger.debug("commit_audio is a no-op for Gemini (server-side VAD)")

    async def receive(self) -> AsyncIterator[ProviderEvent]:
        if not self._ws:
            return
        try:
            async for raw in self._ws:
                msg = json.loads(raw)

                if "serverContent" in msg:
                    content = msg["serverContent"]
                    model_turn = content.get("modelTurn", {})
                    parts = model_turn.get("parts", [])

                    has_text = False
                    for part in parts:
                        if "inlineData" in part:
                            data = part["inlineData"]
                            if data.get("mimeType", "").startswith("audio/"):
                                yield AudioEvent(audio_b64=data["data"])
                        elif "text" in part:
                            has_text = True
                            yield TranscriptEvent(
                                text=part["text"],
                                role="assistant",
                                final=content.get("turnComplete", False),
                            )

                    if content.get("turnComplete") and not has_text:
                        yield TranscriptEvent(text="", role="assistant", final=True)

                elif "toolCall" in msg:
                    tc = msg["toolCall"]
                    for fn_call in tc.get("functionCalls", []):
                        yield ToolCallEvent(
                            call_id=fn_call.get("id", ""),
                            name=fn_call.get("name", ""),
                            arguments=json.dumps(fn_call.get("args", {})),
                        )

                elif "setupComplete" in msg:
                    pass

                elif "interrupted" in msg:
                    logger.debug("Gemini response interrupted")

                else:
                    logger.debug("Unhandled Gemini message: %s", list(msg.keys()))

        except websockets.ConnectionClosed:
            logger.info("Gemini WebSocket closed")

    async def send_tool_result(self, call_id: str, result: str) -> None:
        if not self._ws:
            return
        await self._ws.send(json.dumps({
            "tool_response": {
                "functionResponses": [{
                    "id": call_id,
                    "name": "",  # Gemini doesn't require name in response
                    "response": {"result": result},
                }],
            },
        }))

    async def close(self) -> None:
        if self._ws:
            await self._ws.close()
            self._ws = None
