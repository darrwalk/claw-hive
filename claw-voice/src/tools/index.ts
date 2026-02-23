import { readFile } from 'fs/promises'
import { join } from 'path'
import type { ToolDef } from '../providers/base.js'
import { BUILTIN_TOOLS } from './builtin.js'
import { createDelegateRegistration, createGatewayToolRegistration } from './gateway.js'
import type { ToolHandler, ToolRegistration, ToolsConfig } from './types.js'

export class ToolRegistry {
  private tools = new Map<string, ToolRegistration>()

  register(name: string, registration: ToolRegistration): void {
    this.tools.set(name, registration)
  }

  get definitions(): ToolDef[] {
    return Array.from(this.tools.values()).map((t) => t.definition)
  }

  async execute(name: string, argumentsJson: string): Promise<string> {
    const registration = this.tools.get(name)
    if (!registration) return `Unknown tool: ${name}`

    let args: Record<string, string>
    try {
      args = JSON.parse(argumentsJson)
    } catch {
      return `Error: invalid JSON arguments: ${argumentsJson}`
    }

    return registration.handler(args)
  }
}

export async function createToolRegistry(workspacePath?: string): Promise<ToolRegistry> {
  const registry = new ToolRegistry()

  // Register built-in tools
  for (const [name, reg] of Object.entries(BUILTIN_TOOLS)) {
    registry.register(name, reg)
  }

  // Register delegate tool (gateway)
  registry.register('delegate', createDelegateRegistration())

  // Load additional gateway tools from tools.json if available
  if (workspacePath) {
    const configPath = join(workspacePath, 'skills', 'voice', 'tools.json')
    try {
      const raw = await readFile(configPath, 'utf-8')
      const config: ToolsConfig = JSON.parse(raw)
      for (const tool of config.gateway || []) {
        registry.register(tool.name, createGatewayToolRegistration(
          tool.name,
          tool.description,
          tool.parameters,
        ))
      }
      console.log(`[voice] Loaded ${config.gateway?.length || 0} gateway tools from tools.json`)
    } catch {
      // tools.json not found — that's fine, just use defaults
    }
  }

  return registry
}
