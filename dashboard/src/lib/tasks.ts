import { readdir, readFile } from 'fs/promises'
import { join } from 'path'

export interface LogEntry {
  ts: string
  event: string
  agent: string
  detail: string
}

export interface Task {
  task_id: string
  title: string
  description: string
  type: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked'
  owner: string | null
  project_id: string | null
  depends_on: string[]
  output_path: string | null
  deadline_minutes: number | null
  blocked_on: string | null
  human_input: string | null
  created_at: string
  claimed_at: string | null
  completed_at: string | null
  log: LogEntry[]
}

const DATA_PATH = process.env.HIVE_DATA_PATH || '/app/data/hive'

export async function getActiveTasks(): Promise<Task[]> {
  const dir = join(DATA_PATH, 'active')
  try {
    const files = await readdir(dir)
    const jsonFiles = files.filter(f => f.endsWith('.json'))
    const tasks = await Promise.all(
      jsonFiles.map(async (f) => {
        const raw = await readFile(join(dir, f), 'utf-8')
        return JSON.parse(raw) as Task
      })
    )
    return tasks.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  } catch {
    return []
  }
}

export async function getArchivedTasks(): Promise<Task[]> {
  const dir = join(DATA_PATH, 'archive')
  try {
    const files = await readdir(dir)
    const jsonFiles = files.filter(f => f.endsWith('.json'))
    const tasks = await Promise.all(
      jsonFiles.map(async (f) => {
        const raw = await readFile(join(dir, f), 'utf-8')
        return JSON.parse(raw) as Task
      })
    )
    return tasks.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  } catch {
    return []
  }
}

export function groupByStatus(tasks: Task[]): Record<string, Task[]> {
  const groups: Record<string, Task[]> = {
    pending: [],
    in_progress: [],
    blocked: [],
    completed: [],
    failed: [],
  }
  for (const task of tasks) {
    const key = task.status in groups ? task.status : 'pending'
    groups[key].push(task)
  }
  return groups
}

export function formatDuration(from: string, to?: string | null): string {
  const start = new Date(from).getTime()
  const end = to ? new Date(to).getTime() : Date.now()
  const mins = Math.floor((end - start) / 60000)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ${mins % 60}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}
