import type { ToolDef } from '../providers/base.js'

export type ToolHandler = (args: Record<string, string>) => Promise<string>

export interface ToolRegistration {
  definition: ToolDef
  handler: ToolHandler
}

export interface ToolsConfig {
  builtin: string[]
  gateway: Array<{
    name: string
    description: string
    parameters: Record<string, unknown>
  }>
}
