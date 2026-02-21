"""Tests for provider configuration — catches deprecated voices (bug #1)."""
from __future__ import annotations

from urllib.parse import urlparse

from config import PROVIDER_DEFS, ProviderConfig, available_providers, get_provider

# Known-good voices per API (update when providers change their lists)
OPENAI_REALTIME_VOICES = {"ash", "ballad", "coral", "sage", "verse"}
GEMINI_LIVE_VOICES = {"Aoede", "Charon", "Fenrir", "Kore", "Puck"}


class TestProviderDefs:
    """Validate the static PROVIDER_DEFS dictionary."""

    def test_all_providers_have_required_keys(self) -> None:
        required = {"url", "key_env", "model", "voice", "protocol"}
        for name, defn in PROVIDER_DEFS.items():
            missing = required - defn.keys()
            assert not missing, f"Provider '{name}' missing keys: {missing}"

    def test_urls_are_websocket(self) -> None:
        for name, defn in PROVIDER_DEFS.items():
            parsed = urlparse(defn["url"])
            assert parsed.scheme in ("ws", "wss"), (
                f"Provider '{name}' URL scheme is '{parsed.scheme}', expected ws/wss"
            )

    def test_protocols_are_known(self) -> None:
        for name, defn in PROVIDER_DEFS.items():
            assert defn["protocol"] in ("openai", "gemini"), (
                f"Provider '{name}' has unknown protocol '{defn['protocol']}'"
            )

    def test_openai_protocol_voices_are_valid(self) -> None:
        """Catches bug #1: deprecated voices like 'nova'."""
        for name, defn in PROVIDER_DEFS.items():
            if defn["protocol"] != "openai":
                continue
            voice = defn["voice"].lower()
            assert voice in OPENAI_REALTIME_VOICES, (
                f"Provider '{name}' voice '{defn['voice']}' not in "
                f"known OpenAI Realtime voices: {OPENAI_REALTIME_VOICES}"
            )

    def test_gemini_voices_are_valid(self) -> None:
        for name, defn in PROVIDER_DEFS.items():
            if defn["protocol"] != "gemini":
                continue
            assert defn["voice"] in GEMINI_LIVE_VOICES, (
                f"Provider '{name}' voice '{defn['voice']}' not in "
                f"known Gemini Live voices: {GEMINI_LIVE_VOICES}"
            )

    def test_gemini_url_uses_new_endpoint(self) -> None:
        """Old v1beta/models/{model} endpoint was deprecated; new endpoint is service-based."""
        for name, defn in PROVIDER_DEFS.items():
            if defn["protocol"] != "gemini":
                continue
            assert "BidiGenerateContent" in defn["url"], (
                f"Provider '{name}' URL should use BidiGenerateContent service endpoint"
            )
            assert "/v1beta/models" not in defn["url"], (
                f"Provider '{name}' still uses deprecated /v1beta/models/ URL"
            )


class TestGetProvider:
    def test_returns_provider_config(self, provider_env: None) -> None:
        cfg = get_provider("openai")
        assert isinstance(cfg, ProviderConfig)
        assert cfg.api_key == "test-openai-key"
        assert cfg.protocol == "openai"

    def test_unknown_provider_raises(self) -> None:
        try:
            get_provider("nonexistent")
            assert False, "Should have raised KeyError"
        except KeyError:
            pass

    def test_missing_env_returns_empty_key(self, monkeypatch) -> None:
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        cfg = get_provider("openai")
        assert cfg.api_key == ""


class TestAvailableProviders:
    def test_reflects_env_vars(self, provider_env: None) -> None:
        providers = available_providers()
        names = {p["name"] for p in providers}
        assert names == set(PROVIDER_DEFS.keys())
        assert all(p["available"] for p in providers)

    def test_unavailable_without_keys(self, monkeypatch) -> None:
        for defn in PROVIDER_DEFS.values():
            monkeypatch.delenv(defn["key_env"], raising=False)
        providers = available_providers()
        assert not any(p["available"] for p in providers)
