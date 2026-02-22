import WebSocket from 'ws'
import type { ProviderConfig } from '../config'
import type { ProviderEvent, ToolDef, VoiceProvider } from './base'

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

    // Wait for connection + session.created
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

    // Build session config
    const sessionConfig: Record<string, unknown> = {
      modalities: ['audio', 'text'],
      instructions,
      voice: this.config.voice,
      input_audio_format: 'pcm16',
      output_audio_format: 'pcm16',
      input_audio_transcription: { model: 'whisper-1' },
      turn_detection: vad
        ? { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 700 }
        : null,
    }

    if (tools.length > 0) {
      sessionConfig.tools = tools.map((t) => ({
        type: 'function',
        name: t.function.name,
        description: t.function.description || '',
        parameters: t.function.parameters || {},
      }))
      sessionConfig.tool_choice = 'auto'
    }

    // Grok needs model in session config
    if (this.config.url.includes('x.ai')) {
      sessionConfig.model = this.config.model
    }

    this.ws.send(JSON.stringify({ type: 'session.update', session: sessionConfig }))
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
      // All other known events silently ignored
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
