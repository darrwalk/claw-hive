import type WebSocket from 'ws'
import type { IncomingMessage } from 'http'
import { getProvider } from './config'
import { assembleInstructions } from './instructions'
import { executeTool, TOOL_DEFINITIONS } from './tools'
import type { VoiceProvider } from './providers/base'
import { OpenAIRealtimeProvider } from './providers/openai-realtime'
import { GeminiLiveProvider } from './providers/gemini-live'

function createProvider(name: string): VoiceProvider {
  const cfg = getProvider(name)
  if (cfg.protocol === 'gemini') return new GeminiLiveProvider(cfg)
  return new OpenAIRealtimeProvider(cfg)
}

export async function handleVoiceSocket(ws: WebSocket, req: IncomingMessage): Promise<void> {
  const url = new URL(req.url || '/', `http://${req.headers.host}`)
  const providerName = url.searchParams.get('provider') || 'grok'
  const vad = url.searchParams.get('vad') === 'true'

  console.log(`[voice] Browser connected, provider=${providerName} vad=${vad}`)

  let voiceProvider: VoiceProvider
  try {
    voiceProvider = createProvider(providerName)
  } catch {
    ws.send(JSON.stringify({ type: 'error', message: `Unknown provider: ${providerName}` }))
    ws.close()
    return
  }

  try {
    const instructions = await assembleInstructions()
    await voiceProvider.connect(instructions, TOOL_DEFINITIONS, vad)
    ws.send(JSON.stringify({ type: 'connected', provider: providerName }))
  } catch (e) {
    console.error('[voice] Failed to connect to provider:', e)
    ws.send(JSON.stringify({ type: 'error', message: String(e) }))
    ws.close()
    return
  }

  // Relay provider events → browser
  let relayDone = false
  const relayPromise = (async () => {
    try {
      for await (const event of voiceProvider.receive()) {
        if (ws.readyState !== ws.OPEN) break
        switch (event.kind) {
          case 'audio':
            ws.send(JSON.stringify({ type: 'audio', data: event.audioB64 }))
            break
          case 'transcript':
            ws.send(JSON.stringify({ type: 'transcript', role: event.role, text: event.text, final: event.final }))
            break
          case 'tool_call': {
            console.log(`[voice] Tool call: ${event.name}(${event.arguments.slice(0, 100)})`)
            ws.send(JSON.stringify({ type: 'tool_call', name: event.name }))
            const result = await executeTool(event.name, event.arguments)
            await voiceProvider.sendToolResult(event.callId, result)
            ws.send(JSON.stringify({ type: 'tool_result', name: event.name, result: result.slice(0, 200) }))
            break
          }
          case 'error':
            ws.send(JSON.stringify({ type: 'error', message: event.message }))
            break
        }
      }
    } catch (e) {
      console.error('[voice] Provider relay error:', e)
    } finally {
      relayDone = true
    }
  })()

  // Listen for browser messages
  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString())
      switch (msg.type) {
        case 'audio':
          await voiceProvider.sendAudio(msg.data)
          break
        case 'commit':
          console.log('[voice] Audio commit from browser')
          await voiceProvider.commitAudio()
          break
        case 'close':
          ws.close()
          break
      }
    } catch (e) {
      console.error('[voice] Error handling browser message:', e)
    }
  })

  // Clean up on browser disconnect
  ws.on('close', async () => {
    console.log('[voice] Browser disconnected')
    await voiceProvider.close()
  })
}
