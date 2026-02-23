import type { FastifyInstance } from 'fastify'
import { availableProviders } from '../config.js'

export async function configRoutes(app: FastifyInstance): Promise<void> {
  app.get('/config', async () => ({
    providers: availableProviders(),
  }))
}
