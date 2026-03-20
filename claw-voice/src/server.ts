import Fastify from 'fastify'
import fastifyWebsocket from '@fastify/websocket'
import fastifyStatic from '@fastify/static'
import fastifyCors from '@fastify/cors'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { healthRoutes } from './routes/health.js'
import { configRoutes } from './routes/config.js'
import { voiceWsRoutes } from './routes/voice-ws.js'
import { createToolRegistry } from './tools/index.js'
import { WORKSPACE_DIR } from './config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = parseInt(process.env.PORT || '8200', 10)
const HOST = process.env.HOSTNAME || '0.0.0.0'

async function main(): Promise<void> {
  const app = Fastify({ logger: true })

  const CORS_ORIGIN = process.env.CORS_ORIGIN
  await app.register(fastifyCors, {
    origin: CORS_ORIGIN ? CORS_ORIGIN.split(',') : false,
  })
  await app.register(fastifyWebsocket, {
    options: { maxPayload: 1 * 1024 * 1024 },
  })

  // Serve widget bundle from dist/ with no-cache for freshness after deploys
  const distDir = join(__dirname, '..', 'dist')
  await app.register(fastifyStatic, {
    root: distDir,
    prefix: '/dist/',
    decorateReply: false,
    cacheControl: false,
    setHeaders(res) {
      res.setHeader('Cache-Control', 'no-cache')
    },
  })

  // Serve standalone UI with WS_TOKEN injected (Tailscale-only page)
  app.get('/', async (_request, reply) => {
    const token = process.env.WS_TOKEN || ''
    reply.type('text/html').send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<title>Claudia Voice</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; background: #0a0a10; }
  claw-voice { display: block; width: 100%; max-width: 420px; height: 100dvh; margin: 0 auto; }
</style>
</head>
<body>
<claw-voice theme="dark" token="${token}"></claw-voice>
<script src="/dist/claw-voice.js"></script>
</body>
</html>`)
  })

  const toolRegistry = await createToolRegistry(WORKSPACE_DIR)
  console.log(`[voice] Tool registry loaded: ${toolRegistry.definitions.map(d => d.function.name).join(', ')}`)

  await app.register(healthRoutes)
  await app.register(configRoutes)
  await voiceWsRoutes(app, toolRegistry)

  await app.listen({ port: PORT, host: HOST })
  console.log(`[voice] claw-voice listening on ${HOST}:${PORT}`)
}

main().catch((err) => {
  console.error('[voice] Fatal error:', err)
  process.exit(1)
})
