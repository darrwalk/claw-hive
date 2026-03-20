import type { WebSocket } from 'ws'
import { getProvider } from './config.js'
import { assembleInstructions } from './instructions.js'
import { saveTranscript, type LogEntry } from './transcript.js'
import type { ToolRegistry } from './tools/index.js'
import type { VoiceProvider } from './providers/base.js'
import { OpenAIRealtimeProvider } from './providers/openai-realtime.js'
import { GeminiLiveProvider } from './providers/gemini-live.js'

const MAX_RECONNECTS = 3
const BASE_DELAY_MS = 1000

let activeSessions = 0
export function getActiveSessions(): number { return activeSessions }

function createProvider(name: string, voice: string): VoiceProvider {
  const cfg = getProvider(name)
  if (voice) cfg.voice = voice
  if (cfg.protocol === 'gemini') return new GeminiLiveProvider(cfg)
  return new OpenAIRealtimeProvider(cfg)
}

function jitteredDelay(attempt: number): number {
  const base = BASE_DELAY_MS * 2 ** attempt
  return base + Math.random() * base * 0.5
}

const SAMPLE_PHRASE = 'Say a short greeting — just one sentence to demonstrate your voice.'

export async function handleVoiceSocket(
  ws: WebSocket,
  providerName: string,
  vad: boolean,
  voice: string,
  sample: boolean,
  toolRegistry: ToolRegistry,
): Promise<void> {
  console.log(`[voice] Browser connected, provider=${providerName} vad=${vad} voice=${voice || '(default)'} sample=${sample}`)

  activeSessions++
  const startTime = new Date()
  const log: LogEntry[] = []
  let partialAssistant = ''
  let voiceProvider: VoiceProvider | null = null
  let reconnectCount = 0

  // Keepalive: ping browser WS every 30s
  const pingInterval = setInterval(() => {
    if (ws.readyState === ws.OPEN) ws.ping()
  }, 30_000)

  async function connectProvider(): Promise<VoiceProvider> {
    const provider = createProvider(providerName, voice)
    const instructions = await assembleInstructions()
    await provider.connect(instructions, toolRegistry.definitions, vad)
    return provider
  }

  async function relay(provider: VoiceProvider): Promise<'reconnect' | 'done'> {
    for await (const event of provider.receive()) {
      if (ws.readyState !== ws.OPEN) return 'done'
      switch (event.kind) {
        case 'audio':
          if (ws.bufferedAmount < 1024 * 1024) {
            ws.send(JSON.stringify({ type: 'audio', data: event.audioB64 }))
          }
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
          await provider.sendToolResult(event.callId, event.name, result)
          ws.send(JSON.stringify({ type: 'tool_result', name: event.name, result: result.slice(0, 200) }))
          log.push({ role: 'tool', text: `[${event.name}] ${result.slice(0, 200)}` })
          break
        }
        case 'reconnect':
          console.log(`[voice] Provider requested reconnect: ${event.reason}`)
          return 'reconnect'
        case 'error':
          ws.send(JSON.stringify({ type: 'error', message: event.message }))
          break
      }
    }
    // Provider stream ended (WS closed) — treat as reconnectable if browser still open
    if (ws.readyState === ws.OPEN) return 'reconnect'
    return 'done'
  }

  // Initial connect
  try {
    voiceProvider = await connectProvider()
    ws.send(JSON.stringify({ type: 'connected', provider: providerName }))
    if (sample) {
      console.log('[voice] Sending voice sample prompt')
      await voiceProvider.sendText(SAMPLE_PHRASE)
    }
  } catch (e) {
    console.error('[voice] Failed to connect to provider:', e)
    ws.send(JSON.stringify({ type: 'error', message: String(e) }))
    ws.close()
    return
  }

  // Relay loop with reconnection
  const relayPromise = (async () => {
    while (ws.readyState === ws.OPEN && voiceProvider) {
      const outcome = await relay(voiceProvider)
      if (outcome === 'done') break

      // Reconnect
      await voiceProvider.close().catch(() => {})
      reconnectCount++
      if (reconnectCount > MAX_RECONNECTS) {
        console.log(`[voice] Max reconnects (${MAX_RECONNECTS}) exceeded`)
        ws.send(JSON.stringify({ type: 'error', message: 'Session ended — max reconnects reached' }))
        break
      }

      const delay = jitteredDelay(reconnectCount - 1)
      console.log(`[voice] Reconnecting provider (attempt ${reconnectCount}/${MAX_RECONNECTS}) in ${Math.round(delay)}ms`)
      ws.send(JSON.stringify({ type: 'transcript', role: 'assistant', text: 'Reconnecting...', final: true }))

      await new Promise((r) => setTimeout(r, delay))
      if (ws.readyState !== ws.OPEN) break

      try {
        voiceProvider = await connectProvider()
        reconnectCount = 0
        ws.send(JSON.stringify({ type: 'connected', provider: providerName }))
        console.log('[voice] Provider reconnected successfully')
      } catch (e) {
        console.error('[voice] Reconnect failed:', e)
        ws.send(JSON.stringify({ type: 'error', message: `Reconnect failed: ${e}` }))
      }
    }
  })()

  // Listen for browser messages
  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString())
      switch (msg.type) {
        case 'audio':
          await voiceProvider?.sendAudio(msg.data)
          break
        case 'commit':
          console.log('[voice] Audio commit from browser')
          await voiceProvider?.commitAudio()
          break
        case 'ping':
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
    clearInterval(pingInterval)
    activeSessions--
    console.log('[voice] Browser disconnected')
    await voiceProvider?.close()
    try {
      await saveTranscript(providerName, log, startTime)
    } catch (e) {
      console.error('[voice] Failed to save transcript:', e)
    }
  })
}
