import WebSocket from 'ws'
import type { ProviderConfig } from '../config.js'
import type { ProviderEvent, ToolDef, VoiceProvider } from './base.js'

export class OpenAIRealtimeProvider implements VoiceProvider {
  private ws: WebSocket | null = null
  private vad = false
  private config: ProviderConfig

  constructor(config: ProviderConfig) {
    this.config = config
  }

  async connect(instructions: string, tools: ToolDef[], vad = false): Promise<void> {
    this.vad = vad

    let url = this.config.url
    if (url.includes('openai.com')) url = `${url}?model=${this.config.model}`

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiKey}`,
    }
    if (this.config.url.includes('openai.com')) {
      headers['OpenAI-Beta'] = 'realtime=v1'
    }

    this.ws = new WebSocket(url, { headers })

    await new Promise<void>((resolve, reject) => {
      this.ws!.once('error', reject)
      this.ws!.once('message', (raw) => {
        const msg = JSON.parse(raw.toString())
        if (msg.type === 'error') {
          reject(new Error(`Provider rejected session: ${msg.error?.message || JSON.stringify(msg)}`))
          return
        }
        resolve()
      })
    })

    const isGrok = this.config.url.includes('x.ai')

    const toolsDef = tools.length > 0
      ? tools.map((t) => ({
          type: 'function' as const,
          name: t.function.name,
          description: t.function.description || '',
          parameters: t.function.parameters || {},
        }))
      : undefined

    const turnDetection = vad
      ? { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 700 }
      : null

    const sessionConfig: Record<string, unknown> = isGrok
      ? {
          instructions,
          voice: this.config.voice,
          turn_detection: turnDetection,
          audio: {
            input: { format: { type: 'audio/pcm', rate: 24000 } },
            output: { format: { type: 'audio/pcm', rate: 24000 } },
          },
          ...(toolsDef && { tools: toolsDef, tool_choice: 'auto' }),
        }
      : {
          modalities: ['audio', 'text'],
          instructions,
          voice: this.config.voice,
          input_audio_format: 'pcm16',
          output_audio_format: 'pcm16',
          input_audio_transcription: { model: 'whisper-1' },
          turn_detection: turnDetection,
          ...(toolsDef && { tools: toolsDef, tool_choice: 'auto' }),
        }

    this.ws.send(JSON.stringify({ type: 'session.update', session: sessionConfig }))
  }

  async sendText(text: string): Promise<void> {
    if (!this.ws) return
    this.ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    }))
    this.ws.send(JSON.stringify({ type: 'response.create' }))
  }

  async sendAudio(audioB64: string): Promise<void> {
    this.ws?.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: audioB64 }))
  }

  async commitAudio(): Promise<void> {
    if (!this.ws || this.vad) return
    this.ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }))
    this.ws.send(JSON.stringify({ type: 'response.create' }))
  }

  async *receive(): AsyncGenerator<ProviderEvent> {
    if (!this.ws) return

    const messages = this.iterateMessages()
    for await (const raw of messages) {
      const msg = JSON.parse(raw)
      const t = msg.type || ''

      if (t === 'response.audio.delta' || t === 'response.output_audio.delta') {
        yield { kind: 'audio', audioB64: msg.delta }
      } else if (t === 'response.audio_transcript.delta' || t === 'response.output_audio_transcript.delta') {
        yield { kind: 'transcript', text: msg.delta || '', role: 'assistant', final: false }
      } else if (t === 'response.audio_transcript.done' || t === 'response.output_audio_transcript.done') {
        yield { kind: 'transcript', text: msg.transcript || '', role: 'assistant', final: true }
      } else if (t === 'conversation.item.input_audio_transcription.completed') {
        yield { kind: 'transcript', text: msg.transcript || '', role: 'user', final: true }
      } else if (t === 'response.function_call_arguments.done') {
        yield {
          kind: 'tool_call',
          callId: msg.call_id || '',
          name: msg.name || '',
          arguments: msg.arguments || '{}',
        }
      } else if (t === 'error') {
        yield { kind: 'error', message: msg.error?.message || JSON.stringify(msg) }
      }
    }
  }

  async sendToolResult(callId: string, result: string): Promise<void> {
    if (!this.ws) return
    this.ws.send(
      JSON.stringify({
        type: 'conversation.item.create',
        item: { type: 'function_call_output', call_id: callId, output: result },
      }),
    )
    this.ws.send(JSON.stringify({ type: 'response.create' }))
  }

  async close(): Promise<void> {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  private async *iterateMessages(): AsyncGenerator<string> {
    const ws = this.ws!
    const queue: string[] = []
    let resolve: (() => void) | null = null
    let done = false

    const onMessage = (data: WebSocket.Data) => {
      queue.push(data.toString())
      resolve?.()
    }
    const onClose = () => {
      done = true
      resolve?.()
    }
    const onError = () => {
      done = true
      resolve?.()
    }

    ws.on('message', onMessage)
    ws.on('close', onClose)
    ws.on('error', onError)

    try {
      while (true) {
        while (queue.length > 0) yield queue.shift()!
        if (done) return
        await new Promise<void>((r) => { resolve = r })
        resolve = null
      }
    } finally {
      ws.off('message', onMessage)
      ws.off('close', onClose)
      ws.off('error', onError)
    }
  }
}
