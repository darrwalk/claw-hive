import type { FastifyInstance } from 'fastify'
import { handleVoiceSocket } from '../handler.js'
import type { ToolRegistry } from '../tools/index.js'

export async function voiceWsRoutes(app: FastifyInstance, toolRegistry: ToolRegistry): Promise<void> {
  app.get('/ws', { websocket: true }, (socket, request) => {
    const provider = (request.query as Record<string, string>).provider || 'grok'
    const vad = (request.query as Record<string, string>).vad === 'true'
    handleVoiceSocket(socket, provider, vad, toolRegistry)
  })
}
