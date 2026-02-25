import type WebSocket from 'ws'

export async function* iterateWsMessages(ws: WebSocket): AsyncGenerator<string> {
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
