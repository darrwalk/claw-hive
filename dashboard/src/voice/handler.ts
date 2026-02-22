import type WebSocket from 'ws'
import type { IncomingMessage } from 'http'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { getProvider, WORKSPACE_DIR } from './config'
import { assembleInstructions } from './instructions'
import { executeTool, TOOL_DEFINITIONS } from './tools'
import type { VoiceProvider } from './providers/base'
import { OpenAIRealtimeProvider } from './providers/openai-realtime'
import { GeminiLiveProvider } from './providers/gemini-live'

interface LogEntry {
  role: 'user' | 'assistant' | 'tool'
  text: string
}

async function saveTranscript(provider: string, entries: LogEntry[], startTime: Date): Promise<void> {
  if (entries.length === 0) return
  const dir = join(WORKSPACE_DIR, 'memory', 'voice-logs')
  await mkdir(dir, { recursive: true })

  const pad = (n: number) => String(n).padStart(2, '0')
  const d = startTime
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}`
  const filename = `${stamp}.md`

  const duration = Math.round((Date.now() - startTime.getTime()) / 1000)
  const mins = Math.floor(duration / 60)
  const secs = duration % 60

  const lines = [
    `# Voice Session — ${stamp}`,
    '',
    `**Provider:** ${provider} | **Duration:** ${mins}m ${secs}s`,
    '',
    '---',
    '',
  ]

  for (const entry of entries) {
    if (entry.role === 'tool') {
      lines.push(`*${entry.text}*`, '')
    } else {
      const label = entry.role === 'user' ? '**Arnd:**' : '**Claudia:**'
      lines.push(`${label} ${entry.text}`, '')
    }
  }

  await writeFile(join(dir, filename), lines.join('\n'))
  console.log(`[voice] Transcript saved: memory/voice-logs/${filename}`)
}

function createProvider(name: string): VoiceProvider {
  const cfg = getProvider(name)
  if (cfg.protocol === 'gemini') return new GeminiLiveProvider(cfg)
  return new OpenAIRealtimeProvider(cfg)
}

export async function handleVoiceSocket(ws: WebSocket, req: IncomingMessage): Promise<void> {
  const url = new URL(req.url || '/', `http://${req.headers.host}`)
  const providerName = url.searchParams.get('provider') || 'grok'
  const vad = url.searchParams.get('vad') === 'true'

  const sessionId = `voice-${Date.now()}`
  console.log(`[voice] Browser connected, provider=${providerName} vad=${vad} session=${sessionId}`)

  const startTime = new Date()
  const log: LogEntry[] = []
  let partialAssistant = ''

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
            const result = await executeTool(event.name, event.arguments, sessionId)
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
    try {
      await saveTranscript(providerName, log, startTime)
    } catch (e) {
      console.error('[voice] Failed to save transcript:', e)
    }
  })
}
