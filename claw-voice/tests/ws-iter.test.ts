import { describe, it, expect } from 'vitest'
import { EventEmitter } from 'events'
import { iterateWsMessages } from '../src/providers/ws-iter.js'

function createMockWs(): EventEmitter {
  return new EventEmitter()
}

describe('iterateWsMessages', () => {
  it('yields messages in order', async () => {
    const ws = createMockWs()
    const gen = iterateWsMessages(ws as any)

    // Emit async so the generator can start awaiting first
    setTimeout(() => {
      ws.emit('message', Buffer.from('hello'))
      ws.emit('message', Buffer.from('world'))
      ws.emit('close')
    }, 10)

    const results: string[] = []
    for await (const msg of gen) results.push(msg)

    expect(results).toEqual(['hello', 'world'])
  })

  it('stops on close', async () => {
    const ws = createMockWs()
    const gen = iterateWsMessages(ws as any)

    setTimeout(() => {
      ws.emit('message', Buffer.from('one'))
      ws.emit('close')
    }, 10)

    const results: string[] = []
    for await (const msg of gen) results.push(msg)

    expect(results).toEqual(['one'])
  })

  it('stops on error', async () => {
    const ws = createMockWs()
    const gen = iterateWsMessages(ws as any)

    setTimeout(() => {
      ws.emit('message', Buffer.from('data'))
      ws.emit('error')
    }, 10)

    const results: string[] = []
    for await (const msg of gen) results.push(msg)

    expect(results).toEqual(['data'])
  })

  it('caps queue at 500 messages', async () => {
    const ws = createMockWs()
    const gen = iterateWsMessages(ws as any)

    setTimeout(() => {
      for (let i = 0; i < 600; i++) {
        ws.emit('message', Buffer.from(String(i)))
      }
      ws.emit('close')
    }, 10)

    const results: string[] = []
    for await (const msg of gen) results.push(msg)

    expect(results.length).toBe(500)
    expect(results[0]).toBe('100')
    expect(results[499]).toBe('599')
  })

  it('cleans up event listeners on return', async () => {
    const ws = createMockWs()
    const gen = iterateWsMessages(ws as any)

    setTimeout(() => {
      ws.emit('message', Buffer.from('test'))
      ws.emit('close')
    }, 10)

    for await (const _ of gen) { /* consume */ }

    expect(ws.listenerCount('message')).toBe(0)
    expect(ws.listenerCount('close')).toBe(0)
    expect(ws.listenerCount('error')).toBe(0)
  })
})
