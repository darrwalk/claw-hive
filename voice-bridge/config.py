from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class ProviderConfig:
    url: str
    api_key: str
    model: str
    voice: str
    protocol: str  # "openai" or "gemini"


PROVIDER_DEFS: dict[str, dict] = {
    "grok": {
        "url": "wss://api.x.ai/v1/realtime",
        "key_env": "XAI_API_KEY",
        "model": "grok-3-fast",
        "voice": "Sage",
        "protocol": "openai",
    },
    "openai": {
        "url": "wss://api.openai.com/v1/realtime",
        "key_env": "OPENAI_API_KEY",
        "model": "gpt-4o-realtime-preview",
        "voice": "nova",
        "protocol": "openai",
    },
    "gemini": {
        "url": "wss://generativelanguage.googleapis.com/v1beta/models",
        "key_env": "GOOGLE_API_KEY",
        "model": "gemini-2.0-flash-live-001",
        "voice": "Kore",
        "protocol": "gemini",
    },
}

WORKSPACE_DIR = os.getenv("WORKSPACE_DIR", "/workspace")


def get_provider(name: str) -> ProviderConfig:
    defn = PROVIDER_DEFS[name]
    api_key = os.getenv(defn["key_env"], "")
    return ProviderConfig(
        url=defn["url"],
        api_key=api_key,
        model=defn["model"],
        voice=defn["voice"],
        protocol=defn["protocol"],
    )


def available_providers() -> list[dict]:
    result = []
    for name, defn in PROVIDER_DEFS.items():
        has_key = bool(os.getenv(defn["key_env"]))
        result.append({"name": name, "available": has_key, "protocol": defn["protocol"]})
    return result
