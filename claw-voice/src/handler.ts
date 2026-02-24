import type { WebSocket } from 'ws'
import { getProvider } from './config.js'
import { assembleInstructions } from './instructions.js'
import { saveTranscript, type LogEntry } from './transcript.js'
import type { ToolRegistry } from './tools/index.js'
import type { VoiceProvider } from './providers/base.js'
import { OpenAIRealtimeProvider } from './providers/openai-realtime.js'
import { GeminiLiveProvider } from './providers/gemini-live.js'

function createProvider(name: string, voice: string): VoiceProvider {
  const cfg = getProvider(name)
  if (voice) cfg.voice = voice
  if (cfg.protocol === 'gemini') return new GeminiLiveProvider(cfg)
  return new OpenAIRealtimeProvider(cfg)
}

export async function handleVoiceSocket(
  ws: WebSocket,
  providerName: string,
  vad: boolean,
  voice: string,
  toolRegistry: ToolRegistry,
): Promise<void> {
  console.log(`[voice] Browser connected, provider=${providerName} vad=${vad} voice=${voice || '(default)'}`)

  const startTime = new Date()
  const log: LogEntry[] = []
  let partialAssistant = ''

  let voiceProvider: VoiceProvider
  try {
    voiceProvider = createProvider(providerName, voice)
  } catch {
    ws.send(JSON.stringify({ type: 'error', message: `Unknown provider: ${providerName}` }))
    ws.close()
    return
  }

  try {
    const instructions = await assembleInstructions()
    await voiceProvider.connect(instructions, toolRegistry.definitions, vad)
    ws.send(JSON.stringify({ type: 'connected', provider: providerName }))
  } catch (e) {
    console.error('[voice] Failed to connect to provider:', e)
    ws.send(JSON.stringify({ type: 'error', message: String(e) }))
    ws.close()
    return
  }

  // Relay provider events → browser
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
            if (event.role === 'user' && event.final && event.text.trim()) {
              log.push({ role: 'user', text: event.text.trim() })
            } else if (event.role === 'assistant') {
              partialAssistant += event.text
              if (event.final) {
                if (partialAssistant.trim()) log.push({ role: 'assistant', text: partialAssistant.trim() })
                partialAssistant = ''
              }
            }
            break
          case 'tool_call': {
            console.log(`[voice] Tool call: ${event.name}(${event.arguments.slice(0, 100)})`)
            ws.send(JSON.stringify({ type: 'tool_call', name: event.name }))
            const result = await toolRegistry.execute(event.name, event.arguments)
            await voiceProvider.sendToolResult(event.callId, result)
            ws.send(JSON.stringify({ type: 'tool_result', name: event.name, result: result.slice(0, 200) }))
            log.push({ role: 'tool', text: `[${event.name}] ${result.slice(0, 200)}` })
            break
          }
          case 'error':
            ws.send(JSON.stringify({ type: 'error', message: event.message }))
            break
        }
      }
    } catch (e) {
      console.error('[voice] Provider relay error:', e)
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
    try {
      await saveTranscript(providerName, log, startTime)
    } catch (e) {
      console.error('[voice] Failed to save transcript:', e)
    }
  })
}
