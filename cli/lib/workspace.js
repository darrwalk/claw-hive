import { readdir, readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'

export const WORKSPACE_PATH = process.env.WORKSPACE_PATH || '/home/openclaw/workspace'

/**
 * Resolves a relative path against WORKSPACE_PATH and throws if it escapes the sandbox.
 * @param {string} relativePath
 * @returns {string} absolute resolved path
 */
export function safePath(relativePath) {
  const root = resolve(WORKSPACE_PATH)
  const full = resolve(root, relativePath)
  if (!full.startsWith(root + '/') && full !== root) {
    throw new Error(`Path traversal denied: ${relativePath}`)
  }
  return full
}

/**
 * Lists a directory, returning entries sorted dirs-first then alphabetically.
 * @param {string} relativePath
 * @param {{ all?: boolean }} opts
 * @returns {Promise<Array<{ name: string, type: 'file'|'directory', size: number, modified: string }>>}
 */
export async function listDirectory(relativePath, { all = false } = {}) {
  const full = safePath(relativePath)
  const entries = await readdir(full, { withFileTypes: true })
  const filtered = all ? entries : entries.filter(e => !e.name.startsWith('.'))
  const results = await Promise.all(
    filtered.map(async (e) => {
      const s = await stat(join(full, e.name)).catch(() => null)
      return {
        name: e.name,
        type: /** @type {'file'|'directory'} */ (e.isDirectory() ? 'directory' : 'file'),
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

/**
 * Reads a text file's content. Detects binary files (throws) and truncates large files.
 * @param {string} relativePath
 * @param {{ maxBytes?: number }} opts
 * @returns {Promise<{ content: string, truncated: boolean }>}
 */
export async function readFileContent(relativePath, { maxBytes = 102400 } = {}) {
  const full = safePath(relativePath)
  const s = await stat(full)

  // Read first 512 bytes to check for binary (null bytes)
  const sampleSize = Math.min(512, s.size)
  if (sampleSize > 0) {
    const fd = await readFile(full)
    const sample = fd.slice(0, sampleSize)
    if (sample.includes(0)) {
      throw new Error('Binary file — not printable')
    }

    if (s.size > maxBytes) {
      const partial = fd.slice(0, maxBytes).toString('utf-8')
      const content = partial + `\n# [truncated: file is ${s.size} bytes, showing first 100KB]`
      return { content, truncated: true }
    }

    return { content: fd.toString('utf-8'), truncated: false }
  }

  return { content: '', truncated: false }
}
