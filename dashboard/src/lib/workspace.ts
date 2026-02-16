import { readdir, readFile, writeFile, stat } from 'fs/promises'
import { join, resolve, extname } from 'path'
import { getActiveTasks, getArchivedTasks } from './tasks'

export const WORKSPACE_PATH = process.env.WORKSPACE_PATH || '/app/workspace'
const DATA_PATH = process.env.HIVE_DATA_PATH || '/app/data/hive'
const FAVORITES_FILE = join(DATA_PATH, 'workspace-favorites.json')

export interface DirEntry {
  name: string
  type: 'file' | 'directory'
  size: number
  modified: string
}

export interface Favorite {
  path: string
  label: string
  added: string
}

function safePath(relativePath: string): string {
  const full = resolve(WORKSPACE_PATH, relativePath)
  if (!full.startsWith(resolve(WORKSPACE_PATH))) {
    throw new Error('Path traversal denied')
  }
  return full
}

const MIME_MAP: Record<string, string> = {
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.ts': 'text/typescript',
  '.js': 'text/javascript',
  '.py': 'text/x-python',
  '.yml': 'text/yaml',
  '.yaml': 'text/yaml',
  '.toml': 'text/toml',
  '.sh': 'text/x-shellscript',
  '.log': 'text/plain',
  '.csv': 'text/csv',
  '.xml': 'text/xml',
  '.html': 'text/html',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
}

function getMimeType(filename: string): string {
  return MIME_MAP[extname(filename).toLowerCase()] || 'application/octet-stream'
}

function isTextMime(mime: string): boolean {
  return mime.startsWith('text/') || mime === 'application/json'
}

export async function getAgents(): Promise<string[]> {
  const [active, archived] = await Promise.all([getActiveTasks(), getArchivedTasks()])
  const owners = new Set<string>()
  for (const task of [...active, ...archived]) {
    if (task.owner) owners.add(task.owner)
  }
  const validated: string[] = []
  for (const owner of [...owners].sort()) {
    try {
      const s = await stat(join(WORKSPACE_PATH, owner))
      if (s.isDirectory()) validated.push(owner)
    } catch { /* no directory for this agent */ }
  }
  return validated
}

export async function listDirectory(relativePath: string): Promise<DirEntry[]> {
  const full = safePath(relativePath)
  const entries = await readdir(full, { withFileTypes: true })
  const results = await Promise.all(
    entries
      .filter(e => !e.name.startsWith('.'))
      .map(async (e) => {
        const s = await stat(join(full, e.name)).catch(() => null)
        return {
          name: e.name,
          type: (e.isDirectory() ? 'directory' : 'file') as 'file' | 'directory',
          size: s?.size ?? 0,
          modified: s?.mtime.toISOString() ?? '',
        }
      })
  )
  return results.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export async function readFileContent(relativePath: string): Promise<{ content: string; mimeType: string } | { buffer: Buffer; mimeType: string }> {
  const full = safePath(relativePath)
  const mime = getMimeType(full)
  if (isTextMime(mime)) {
    const content = await readFile(full, 'utf-8')
    return { content, mimeType: mime }
  }
  const buffer = await readFile(full)
  return { buffer: Buffer.from(buffer), mimeType: mime }
}

export async function getFavorites(): Promise<Favorite[]> {
  try {
    const raw = await readFile(FAVORITES_FILE, 'utf-8')
    return JSON.parse(raw) as Favorite[]
  } catch {
    return []
  }
}

export async function addFavorite(path: string, label?: string): Promise<Favorite[]> {
  const favorites = await getFavorites()
  if (favorites.some(f => f.path === path)) return favorites
  favorites.push({ path, label: label || path.split('/').pop() || path, added: new Date().toISOString() })
  await writeFile(FAVORITES_FILE, JSON.stringify(favorites, null, 2))
  return favorites
}

export async function removeFavorite(path: string): Promise<Favorite[]> {
  const favorites = (await getFavorites()).filter(f => f.path !== path)
  await writeFile(FAVORITES_FILE, JSON.stringify(favorites, null, 2))
  return favorites
}
