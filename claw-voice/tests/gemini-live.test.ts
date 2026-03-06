import { describe, it, expect } from 'vitest'
import { GeminiLiveProvider } from '../src/providers/gemini-live.js'

describe('GeminiLiveProvider', () => {
  describe('sendToolResult', () => {
    it('includes function name in tool_response', async () => {
      const provider = new GeminiLiveProvider({
        protocol: 'gemini', url: '', apiKey: '', model: '', voice: ''
      })
      const sent: string[] = []
      ;(provider as any).ws = { send: (data: string) => sent.push(data) }

      await provider.sendToolResult('call-123', 'search_memory', 'found results')

      expect(sent).toHaveLength(1)
      const msg = JSON.parse(sent[0])
      expect(msg.tool_response.functionResponses[0]).toEqual({
        id: 'call-123',
        name: 'search_memory',
        response: { result: 'found results' },
      })
    })

    it('does not send empty name', async () => {
      const provider = new GeminiLiveProvider({
        protocol: 'gemini', url: '', apiKey: '', model: '', voice: ''
      })
      const sent: string[] = []
      ;(provider as any).ws = { send: (data: string) => sent.push(data) }

      await provider.sendToolResult('call-456', 'read_file', 'file contents')

      const msg = JSON.parse(sent[0])
      expect(msg.tool_response.functionResponses[0].name).toBe('read_file')
      expect(msg.tool_response.functionResponses[0].name).not.toBe('')
    })
  })
})
