# Voice Skill — claw-voice

Real-time voice conversation service for openClaw agents. Provides voice input/output via WebSocket relay to AI voice providers (Grok, OpenAI, Gemini).

## Capabilities

- **Voice conversations**: Push-to-talk and hands-free (VAD) modes
- **Multi-provider**: Grok (cheapest), OpenAI (highest quality), Gemini (free preview)
- **Tool execution**: search_memory, read_file during voice sessions
- **Delegation**: Hands off complex requests to the main agent via gateway
- **Transcript logging**: All voice sessions saved to `memory/voice-logs/`

## Architecture

The voice service is a standalone Fastify server that:
1. Accepts WebSocket connections from the browser (`<claw-voice>` web component)
2. Connects to AI voice provider (OpenAI Realtime API, Grok, or Gemini Live)
3. Relays audio bidirectionally between browser and provider
4. Executes tool calls (memory search, file reads, delegation) during conversations
5. Saves transcripts on disconnect

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /config` | Available providers |
| `WS /ws?provider=grok&vad=false` | Voice WebSocket |
| `GET /` | Standalone voice UI |
| `GET /dist/claw-voice.js` | Embeddable web component |

## Web Component

```html
<script src="https://voice-host:4200/dist/claw-voice.js"></script>
<claw-voice ws-url="wss://voice-host:4200/ws" provider="grok" theme="dark" mode="push-to-talk"></claw-voice>
```

Events: `voice-connected`, `voice-transcript`, `voice-error`, `voice-disconnected`

## Tools Available During Voice

- `search_memory(query)` — Search workspace memory files
- `read_file(path)` — Read workspace files (8KB limit)
- `delegate(request)` — Hand off to main agent via gateway

## Configuration

Environment variables:
- `XAI_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY` — Provider credentials
- `GATEWAY_URL`, `GATEWAY_TOKEN` — Gateway for delegation
- `WORKSPACE_PATH` — Mounted workspace directory
- `PORT` — Service port (default: 8200)
