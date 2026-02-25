import type { FastifyInstance } from 'fastify'
import { getActiveSessions } from '../handler.js'
import { availableProviders } from '../config.js'

const startedAt = Date.now()

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    const mem = process.memoryUsage()
    return {
      status: 'ok',
      service: 'claw-voice',
      uptime: Math.round((Date.now() - startedAt) / 1000),
      memoryMB: Math.round(mem.rss / 1024 / 1024),
      activeSessions: getActiveSessions(),
      providers: availableProviders().filter(p => p.available).map(p => p.name),
    }
  })
}
