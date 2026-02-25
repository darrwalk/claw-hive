import WebSocket from 'ws'
import type { ProviderConfig } from '../config.js'
import type { ProviderEvent, ToolDef, VoiceProvider } from './base.js'
import { iterateWsMessages } from './ws-iter.js'

function openaiToolsToGemini(tools: ToolDef[]): Record<string, unknown>[] {
  return tools
    .filter((t) => t.type === 'function')
    .map((t) => ({
      name: t.function.name,
      description: t.function.description || '',
      parameters: t.function.parameters || {},
    }))
}

export class GeminiLiveProvider implements VoiceProvider {
  private ws: WebSocket | null = null
  private config: ProviderConfig
  private vad = false
  private audioBuffer: string[] = []

  get pttBuffering(): boolean { return !this.vad }

  constructor(config: ProviderConfig) {
    this.config = config
  }

  async connect(instructions: string, tools: ToolDef[], vad = false): Promise<void> {
    this.vad = vad
    const url = `${this.config.url}?key=${this.config.apiKey}`
    this.ws = new WebSocket(url)

    await Promise.race([
      new Promise<void>((resolve, reject) => {
        this.ws!.once('open', resolve)
        this.ws!.once('error', reject)
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini WebSocket open timed out (10s)')), 10_000),
      ),
    ])

    const setup: Record<string, unknown> = {
      model: `models/${this.config.model}`,
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: this.config.voice },
          },
        },
      },
      systemInstruction: { parts: [{ text: instructions }] },
    }

    if (tools.length > 0) {
      const geminiFns = openaiToolsToGemini(tools)
      if (geminiFns.length > 0) {
        setup.tools = [{ functionDeclarations: geminiFns }]
      }
    }

    this.ws.send(JSON.stringify({ setup }))

    await Promise.race([
      new Promise<void>((resolve, reject) => {
        this.ws!.once('message', (raw) => {
          const msg = JSON.parse(raw.toString())
          if ('setupComplete' in msg) {
            resolve()
          } else {
            reject(new Error(`Unexpected first message: ${JSON.stringify(Object.keys(msg))}`))
          }
        })
        this.ws!.once('error', reject)
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini setup handshake timed out (10s)')), 10_000),
      ),
    ])
  }

  async sendText(text: string): Promise<void> {
    this.ws?.send(JSON.stringify({
      client_content: {
        turns: [{ role: 'user', parts: [{ text }] }],
        turn_complete: true,
      },
    }))
  }

  async sendAudio(audioB64: string): Promise<void> {
    if (!this.vad) {
      // PTT mode: buffer audio for batch send on commit
      this.audioBuffer.push(audioB64)
      return
    }
    // VAD/hands-free mode: stream in real-time
    this.ws?.send(
      JSON.stringify({
        realtime_input: {
          audio: { data: audioB64, mimeType: 'audio/pcm;rate=16000' },
        },
      }),
    )
  }

  async commitAudio(): Promise<void> {
    if (!this.ws) return

    if (!this.vad && this.audioBuffer.length > 0) {
      // PTT mode: concatenate buffered audio and send as client_content turn
      const combined = this.audioBuffer.join('')
      this.audioBuffer = []
      this.ws.send(JSON.stringify({
        client_content: {
          turns: [{
            role: 'user',
            parts: [{ inline_data: { mime_type: 'audio/pcm;rate=16000', data: combined } }],
          }],
          turn_complete: true,
        },
      }))
      return
    }

    // VAD mode: silence padding fallback (shouldn't normally be called)
    this.audioBuffer = []
  }

  async *receive(): AsyncGenerator<ProviderEvent> {
    if (!this.ws) return

    for await (const raw of iterateWsMessages(this.ws)) {
      const msg = JSON.parse(raw)

      if ('serverContent' in msg) {
        const content = msg.serverContent
        const parts = content.modelTurn?.parts || []
        for (const part of parts) {
          if (part.inlineData?.mimeType?.startsWith('audio/')) {
            yield { kind: 'audio', audioB64: part.inlineData.data }
          }
        }
        if (content.turnComplete) {
          yield { kind: 'transcript', text: '', role: 'assistant', final: true }
        }
      } else if ('toolCall' in msg) {
        for (const fnCall of msg.toolCall.functionCalls || []) {
          yield {
            kind: 'tool_call',
            callId: fnCall.id || '',
            name: fnCall.name || '',
            arguments: JSON.stringify(fnCall.args || {}),
          }
        }
      }
    }
  }

  async sendToolResult(callId: string, result: string): Promise<void> {
    this.ws?.send(
      JSON.stringify({
        tool_response: {
          functionResponses: [
            { id: callId, name: '', response: { result } },
          ],
        },
      }),
    )
  }

  async close(): Promise<void> {
    this.audioBuffer = []
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

}
