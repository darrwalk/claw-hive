import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { WORKSPACE_DIR } from './config.js'

export interface LogEntry {
  role: 'user' | 'assistant' | 'tool'
  text: string
}

export async function saveTranscript(provider: string, entries: LogEntry[], startTime: Date): Promise<void> {
  if (entries.length === 0) return
  const dir = join(WORKSPACE_DIR, 'memory', 'voice-logs')
  await mkdir(dir, { recursive: true })

  const pad = (n: number) => String(n).padStart(2, '0')
  const d = startTime
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}`
  const filename = `${stamp}.md`

  const duration = Math.round((Date.now() - startTime.getTime()) / 1000)
  const mins = Math.floor(duration / 60)
  const secs = duration % 60

  const lines = [
    `# Voice Session — ${stamp}`,
    '',
    `**Provider:** ${provider} | **Duration:** ${mins}m ${secs}s`,
    '',
    '---',
    '',
  ]

  for (const entry of entries) {
    if (entry.role === 'tool') {
      lines.push(`*${entry.text}*`, '')
    } else {
      const label = entry.role === 'user' ? '**Arnd:**' : '**Claudia:**'
      lines.push(`${label} ${entry.text}`, '')
    }
  }

  await writeFile(join(dir, filename), lines.join('\n'))
  console.log(`[voice] Transcript saved: memory/voice-logs/${filename}`)
}
