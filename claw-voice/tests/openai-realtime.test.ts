import { describe, it, expect } from 'vitest'
import { OpenAIRealtimeProvider } from '../src/providers/openai-realtime.js'

describe('OpenAIRealtimeProvider', () => {
  describe('sendToolResult', () => {
    it('sends call_id and output (ignores name)', async () => {
      const provider = new OpenAIRealtimeProvider({
        protocol: 'openai', url: '', apiKey: '', model: '', voice: ''
      })
      const sent: string[] = []
      ;(provider as any).ws = { send: (data: string) => sent.push(data) }

      await provider.sendToolResult('call-789', 'search_memory', 'results here')

      expect(sent).toHaveLength(2) // conversation.item.create + response.create
      const createMsg = JSON.parse(sent[0])
      expect(createMsg.type).toBe('conversation.item.create')
      expect(createMsg.item.call_id).toBe('call-789')
      expect(createMsg.item.output).toBe('results here')
    })
  })
})
