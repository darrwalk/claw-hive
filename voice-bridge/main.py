"""Voice Bridge — FastAPI relay between browser and speech-to-speech providers."""
from __future__ import annotations

import asyncio
import json
import logging

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from claudia import assemble_instructions
from config import available_providers, get_provider
from providers.base import AudioEvent, ErrorEvent, ToolCallEvent, TranscriptEvent
from providers.gemini_live import GeminiLiveProvider
from providers.openai_realtime import OpenAIRealtimeProvider
from tools import TOOL_DEFINITIONS, execute_tool

logging.basicConfig(level=logging.DEBUG, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Claudia Voice Bridge")
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def index():
    return FileResponse("static/index.html")


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/config")
async def config():
    return JSONResponse({"providers": available_providers()})


def _create_provider(name: str):
    cfg = get_provider(name)
    if cfg.protocol == "gemini":
        return GeminiLiveProvider(cfg)
    return OpenAIRealtimeProvider(cfg)


@app.websocket("/ws")
async def websocket_relay(ws: WebSocket, provider: str = "grok"):
    await ws.accept()
    logger.info("Browser connected, provider=%s", provider)

    try:
        voice_provider = _create_provider(provider)
    except KeyError:
        await ws.send_json({"type": "error", "message": f"Unknown provider: {provider}"})
        await ws.close()
        return

    try:
        instructions = assemble_instructions()
        await voice_provider.connect(instructions, TOOL_DEFINITIONS)
        await ws.send_json({"type": "connected", "provider": provider})
    except Exception as e:
        logger.exception("Failed to connect to provider")
        await ws.send_json({"type": "error", "message": str(e)})
        await ws.close()
        return

    async def relay_from_provider():
        """Forward provider events to the browser."""
        try:
            async for event in voice_provider.receive():
                logger.info("Provider event: %s", type(event).__name__)
                if isinstance(event, AudioEvent):
                    await ws.send_json({
                        "type": "audio",
                        "data": event.audio_b64,
                    })
                elif isinstance(event, TranscriptEvent):
                    await ws.send_json({
                        "type": "transcript",
                        "role": event.role,
                        "text": event.text,
                        "final": event.final,
                    })
                elif isinstance(event, ToolCallEvent):
                    logger.info("Tool call: %s(%s)", event.name, event.arguments[:100])
                    await ws.send_json({
                        "type": "tool_call",
                        "name": event.name,
                    })
                    result = await execute_tool(event.name, event.arguments)
                    await voice_provider.send_tool_result(event.call_id, result)
                    await ws.send_json({
                        "type": "tool_result",
                        "name": event.name,
                        "result": result[:200],
                    })
                elif isinstance(event, ErrorEvent):
                    await ws.send_json({
                        "type": "error",
                        "message": event.message,
                    })
        except WebSocketDisconnect:
            logger.info("Browser disconnected during relay")
        except Exception:
            logger.exception("Provider relay error")

    provider_task = asyncio.create_task(relay_from_provider())

    try:
        while True:
            data = await ws.receive_text()
            msg = json.loads(data)
            msg_type = msg.get("type", "")

            if msg_type == "audio":
                logger.debug("Audio chunk from browser: %d chars", len(msg["data"]))
                await voice_provider.send_audio(msg["data"])
            elif msg_type == "commit":
                logger.info("Audio commit from browser")
                await voice_provider.commit_audio()
            elif msg_type == "close":
                break
    except WebSocketDisconnect:
        logger.info("Browser disconnected")
    except Exception:
        logger.exception("Browser relay error")
    finally:
        provider_task.cancel()
        try:
            await provider_task
        except asyncio.CancelledError:
            pass
        await voice_provider.close()
        logger.info("Session ended")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
