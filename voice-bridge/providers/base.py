from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import AsyncIterator


@dataclass
class AudioEvent:
    """Audio chunk from the provider."""
    audio_b64: str


@dataclass
class TranscriptEvent:
    """Transcript text (partial or final)."""
    text: str
    role: str  # "user" or "assistant"
    final: bool = False


@dataclass
class ToolCallEvent:
    """Provider is requesting a tool call."""
    call_id: str
    name: str
    arguments: str  # JSON string


@dataclass
class ErrorEvent:
    """Error from the provider."""
    message: str


ProviderEvent = AudioEvent | TranscriptEvent | ToolCallEvent | ErrorEvent


class VoiceProvider(ABC):
    @abstractmethod
    async def connect(self, instructions: str, tools: list[dict]) -> None:
        """Open connection to the provider with system instructions and tool definitions."""

    @abstractmethod
    async def send_audio(self, audio_b64: str) -> None:
        """Send a base64-encoded audio chunk to the provider."""

    @abstractmethod
    async def commit_audio(self) -> None:
        """Signal end of user turn (for push-to-talk mode)."""

    @abstractmethod
    async def receive(self) -> AsyncIterator[ProviderEvent]:
        """Yield events from the provider."""

    @abstractmethod
    async def send_tool_result(self, call_id: str, result: str) -> None:
        """Send a tool call result back to the provider."""

    @abstractmethod
    async def close(self) -> None:
        """Close the connection."""
