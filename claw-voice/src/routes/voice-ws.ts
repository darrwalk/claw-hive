import type { FastifyInstance } from 'fastify'
import { handleVoiceSocket } from '../handler.js'
import type { ToolRegistry } from '../tools/index.js'

export async function voiceWsRoutes(app: FastifyInstance, toolRegistry: ToolRegistry): Promise<void> {
  app.get('/ws', { websocket: true }, (socket, request) => {
    const q = request.query as Record<string, string>
    const provider = q.provider || 'gemini'
    const vad = q.vad === 'true'
    const voice = q.voice || ''
    const sample = q.sample === 'true'
    handleVoiceSocket(socket, provider, vad, voice, sample, toolRegistry)
  })
}
