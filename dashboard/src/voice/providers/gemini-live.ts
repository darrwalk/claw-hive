import WebSocket from 'ws'
import type { ProviderConfig } from '../config'
import type { ProviderEvent, ToolDef, VoiceProvider } from './base'

function openaiToolsToGemini(tools: ToolDef[]): Record<string, unknown>[] {
  return tools
    .filter((t) => t.type === 'function')
    .map((t) => ({
      name: t.function.name,
      description: t.function.description || '',
      parameters: t.function.parameters || {},
    }))
}

function generateSilenceB64(): string {
  // 100ms of silence at 16kHz, signed 16-bit LE
  const nSamples = 1600
  const buf = Buffer.alloc(nSamples * 2) // all zeros = silence
  return buf.toString('base64')
}

export class GeminiLiveProvider implements VoiceProvider {
  private ws: WebSocket | null = null
  private config: ProviderConfig

  constructor(config: ProviderConfig) {
    this.config = config
  }

  async connect(instructions: string, tools: ToolDef[], _vad = false): Promise<void> {
    const url = `${this.config.url}?key=${this.config.apiKey}`
    this.ws = new WebSocket(url)

    // Wait for open
    await new Promise<void>((resolve, reject) => {
      this.ws!.once('open', resolve)
      this.ws!.once('error', reject)
    })

    // Build setup message
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

    // Wait for setupComplete
    await new Promise<void>((resolve, reject) => {
      this.ws!.once('message', (raw) => {
        const msg = JSON.parse(raw.toString())
        if ('setupComplete' in msg) {
          resolve()
        } else {
          reject(new Error(`Unexpected first message: ${JSON.stringify(Object.keys(msg))}`))
        }
      })
      this.ws!.once('error', reject)
    })
  }

  async sendAudio(audioB64: string): Promise<void> {
    this.ws?.send(
      JSON.stringify({
        realtime_input: {
          audio: { data: audioB64, mimeType: 'audio/pcm;rate=16000' },
        },
      }),
    )
  }

  async commitAudio(): Promise<void> {
    // Gemini uses server-side VAD only. Send ~500ms of silence so VAD
    // sees speech→silence and triggers end-of-turn.
    if (!this.ws) return
    const silence = generateSilenceB64()
    for (let i = 0; i < 5; i++) {
      this.ws.send(
        JSON.stringify({
          realtime_input: {
            audio: { data: silence, mimeType: 'audio/pcm;rate=16000' },
          },
        }),
      )
      await new Promise((r) => setTimeout(r, 100))
    }
  }

  async *receive(): AsyncGenerator<ProviderEvent> {
    if (!this.ws) return

    for await (const raw of this.iterateMessages()) {
      const msg = JSON.parse(raw)

      if ('serverContent' in msg) {
        const content = msg.serverContent
        const parts = content.modelTurn?.parts || []
        for (const part of parts) {
          if (part.inlineData?.mimeType?.startsWith('audio/')) {
            yield { kind: 'audio', audioB64: part.inlineData.data }
          }
          // Text from Gemini native audio is internal reasoning — skip it
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
      } else if ('interrupted' in msg) {
        // logged, not surfaced
      }
      // setupComplete and others silently ignored
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
