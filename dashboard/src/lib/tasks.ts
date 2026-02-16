import { readdir, readFile } from 'fs/promises'
import { execFileSync } from 'child_process'
import { join } from 'path'
import { Task, Project, groupByStatus, getActivityFeed, getStats, formatDuration } from './types'

export type { Task, Project }
export { groupByStatus, getActivityFeed, getStats, formatDuration }

const DATA_PATH = process.env.HIVE_DATA_PATH || '/app/data/hive'
const HIVE_CLI = '/app/cli/hive-cli.js'

function hive(...args: string[]): string {
  return execFileSync('node', [HIVE_CLI, ...args], {
    env: { ...process.env, HIVE_DATA_DIR: DATA_PATH },
    encoding: 'utf-8',
    timeout: 10000,
  })
}

// --- Read functions (direct file access, unchanged) ---

async function readJsonFiles<T>(dir: string): Promise<T[]> {
  try {
    const files = await readdir(dir)
    const jsonFiles = files.filter(f => f.endsWith('.json'))
    const items = await Promise.all(
      jsonFiles.map(async (f) => {
        const raw = await readFile(join(dir, f), 'utf-8')
        return JSON.parse(raw) as T
      })
    )
    return items
  } catch {
    return []
  }
}

export async function getActiveTasks(): Promise<Task[]> {
  const tasks = await readJsonFiles<Task>(join(DATA_PATH, 'active'))
  return tasks.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

export async function getArchivedTasks(): Promise<Task[]> {
  const tasks = await readJsonFiles<Task>(join(DATA_PATH, 'archive'))
  return tasks.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

export async function getTask(id: string): Promise<Task | null> {
  // Try both filename conventions: bare id and task-prefixed
  const candidates = [id, `task-${id}`]
  for (const subdir of ['active', 'archive']) {
    for (const name of candidates) {
      try {
        const raw = await readFile(join(DATA_PATH, subdir, `${name}.json`), 'utf-8')
        return JSON.parse(raw) as Task
      } catch { /* not found */ }
    }
  }
  return null
}

export async function getProjects(): Promise<Project[]> {
  const dir = join(DATA_PATH, 'projects')
  try {
    const files = await readdir(dir)
    const jsonFiles = files.filter(f => f.endsWith('.json'))
    const projects = await Promise.all(
      jsonFiles.map(async (f) => {
        const raw = await readFile(join(dir, f), 'utf-8')
        return JSON.parse(raw) as Project
      })
    )
    return projects.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  } catch {
    return []
  }
}

export async function getProject(id: string): Promise<Project | null> {
  const candidates = [id, `project-${id}`]
  for (const name of candidates) {
    try {
      const raw = await readFile(join(DATA_PATH, 'projects', `${name}.json`), 'utf-8')
      return JSON.parse(raw) as Project
    } catch { /* not found */ }
  }
  return null
}

// --- Write functions (delegate to hive-cli) ---

export async function createTask(data: { title: string; description: string; type: string; project_id?: string }): Promise<Task> {
  const args = [
    'create',
    '--title', data.title,
    '--desc', data.description,
    '--type', data.type || 'research',
    '--json',
  ]
  if (data.project_id) args.push('--project', data.project_id)

  const output = hive(...args)
  return JSON.parse(output) as Task
}

export async function updateTask(id: string, updates: Partial<Task>): Promise<Task | null> {
  const task = await getTask(id)
  if (!task) return null

  // Use the task_id from the stored task (the canonical ID)
  const taskId = task.task_id
  const args = ['update', taskId, '--json']

  if (updates.status) args.push('--status', updates.status)
  if (updates.owner) args.push('--owner', updates.owner)
  if (updates.output_path) args.push('--output', updates.output_path)
  if (updates.blocked_on) args.push('--blocked-on', updates.blocked_on)

  const output = hive(...args)
  return JSON.parse(output) as Task
}

export async function provideInput(id: string, input: string): Promise<Task | null> {
  const task = await getTask(id)
  if (!task) return null

  const taskId = task.task_id
  const output = hive('provide', taskId, '--input', input, '--json')
  return JSON.parse(output) as Task
}

export async function createProject(data: { title: string; description: string }): Promise<Project> {
  const args = [
    'project', 'create',
    '--title', data.title,
    '--desc', data.description || '',
    '--json',
  ]

  const output = hive(...args)
  return JSON.parse(output) as Project
}

export async function updateProject(id: string, updates: Partial<Project>): Promise<Project | null> {
  const project = await getProject(id)
  if (!project) return null

  const projectId = project.project_id
  const args = ['project', 'update', projectId, '--json']

  if (updates.title) args.push('--title', updates.title)
  if (updates.description) args.push('--desc', updates.description)
  if (updates.status) args.push('--status', updates.status)

  const output = hive(...args)
  return JSON.parse(output) as Project
}
