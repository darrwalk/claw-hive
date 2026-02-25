import { describe, it, expect, vi } from 'vitest'
import { ToolRegistry } from '../src/tools/index.js'
import type { ToolRegistration } from '../src/tools/types.js'

function mockTool(handler: (args: Record<string, string>) => Promise<string>): ToolRegistration {
  return {
    definition: {
      type: 'function',
      function: { name: 'test', description: 'test tool', parameters: {} },
    },
    handler,
  }
}

describe('ToolRegistry', () => {
  it('executes a registered tool', async () => {
    const registry = new ToolRegistry()
    registry.register('greet', mockTool(async (args) => `Hello ${args.name}`))

    const result = await registry.execute('greet', '{"name": "world"}')
    expect(result).toBe('Hello world')
  })

  it('returns error for unknown tool', async () => {
    const registry = new ToolRegistry()
    const result = await registry.execute('nonexistent', '{}')
    expect(result).toBe('Unknown tool: nonexistent')
  })

  it('returns error for invalid JSON', async () => {
    const registry = new ToolRegistry()
    registry.register('test', mockTool(async () => 'ok'))

    const result = await registry.execute('test', 'not json')
    expect(result).toContain('Error: invalid JSON')
  })

  it('times out after 30s', async () => {
    vi.useFakeTimers()
    const registry = new ToolRegistry()
    registry.register('slow', mockTool(() => new Promise(() => { /* never resolves */ })))

    const promise = registry.execute('slow', '{}')

    // Advance past 30s timeout
    vi.advanceTimersByTime(31_000)
    const result = await promise

    expect(result).toContain('timed out after 30s')
    vi.useRealTimers()
  })

  it('returns tool definitions', () => {
    const registry = new ToolRegistry()
    registry.register('a', mockTool(async () => 'a'))
    registry.register('b', mockTool(async () => 'b'))

    expect(registry.definitions).toHaveLength(2)
    expect(registry.definitions[0].function.name).toBe('test')
  })
})
