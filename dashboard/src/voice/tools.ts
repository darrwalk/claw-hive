import { readFile, readdir } from 'fs/promises'
import { join, resolve } from 'path'
import { WORKSPACE_DIR } from './config'
import type { ToolDef } from './providers/base'

export const TOOL_DEFINITIONS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'search_memory',
      description:
        "Search Claudia's memory files for information about a topic. Use when the user asks about something you might have notes on.",
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query — keywords or topic to find in memory files',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a specific file from the workspace. Use for reading notes, documents, or configuration.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: "Relative path within the workspace (e.g., 'memory/state-of-arnd-2026-02.md')",
          },
        },
        required: ['path'],
      },
    },
  },
]

function safePath(relative: string): string | null {
  const workspace = resolve(WORKSPACE_DIR)
  const resolved = resolve(workspace, relative)
  if (!resolved.startsWith(workspace + '/') && resolved !== workspace) return null
  return resolved
}

async function globMd(dir: string, recursive: boolean): Promise<string[]> {
  const results: string[] = []
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(fullPath)
      } else if (recursive && entry.isDirectory()) {
        results.push(...(await globMd(fullPath, true)))
      }
    }
  } catch {
    // directory doesn't exist or not readable
  }
  return results
}

async function searchMemory(query: string): Promise<string> {
  const workspace = resolve(WORKSPACE_DIR)
  const memoryDir = join(workspace, 'memory')
  const queryLower = query.toLowerCase()
  const results: string[] = []
  const seen = new Set<string>()

  const searchPaths = [
    ...(await globMd(memoryDir, true)),
    ...(await globMd(workspace, false)),
  ]

  for (const filePath of searchPaths) {
    if (seen.has(filePath)) continue
    seen.add(filePath)
    try {
      const content = await readFile(filePath, 'utf-8')
      if (!content.toLowerCase().includes(queryLower)) continue

      const lines = content.split('\n')
      const snippets: string[] = []
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(queryLower)) {
          const start = Math.max(0, i - 1)
          const end = Math.min(lines.length, i + 3)
          snippets.push(lines.slice(start, end).join('\n'))
          if (snippets.length >= 2) break
        }
      }
      const rel = filePath.slice(workspace.length + 1)
      results.push(`**${rel}**:\n${snippets.join('\n...\n')}`)
    } catch {
      continue
    }
  }

  if (results.length === 0) return `No results found for '${query}' in memory files.`
  return results.slice(0, 5).join('\n\n---\n\n')
}

async function readWorkspaceFile(path: string): Promise<string> {
  const resolved = safePath(path)
  if (!resolved) return 'Error: invalid path (traversal blocked).'
  try {
    const content = await readFile(resolved, 'utf-8')
    if (content.length > 8000) return content.slice(0, 8000) + '\n\n[truncated — file too long for voice context]'
    return content
  } catch (e) {
    if (e instanceof Error && 'code' in e && (e as NodeJS.ErrnoException).code === 'ENOENT') {
      return `Error: file not found: ${path}`
    }
    return `Error reading file: ${e}`
  }
}

export async function executeTool(name: string, arguments_: string): Promise<string> {
  let args: Record<string, string>
  try {
    args = JSON.parse(arguments_)
  } catch {
    return `Error: invalid JSON arguments: ${arguments_}`
  }

  switch (name) {
    case 'search_memory':
      return searchMemory(args.query || '')
    case 'read_file':
      return readWorkspaceFile(args.path || '')
    default:
      return `Unknown tool: ${name}`
  }
}
