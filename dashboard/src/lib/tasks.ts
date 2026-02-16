import { readdir, readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { Task, Project, groupByStatus, getActivityFeed, getStats, formatDuration } from './types'

export type { Task, Project }
export { groupByStatus, getActivityFeed, getStats, formatDuration }

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

export async function getTask(id: string): Promise<Task | null> {
  for (const subdir of ['active', 'archive']) {
    try {
      const raw = await readFile(join(DATA_PATH, subdir, `${id}.json`), 'utf-8')
      return JSON.parse(raw) as Task
    } catch { /* not found in this dir */ }
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
  try {
    const raw = await readFile(join(DATA_PATH, 'projects', `${id}.json`), 'utf-8')
    return JSON.parse(raw) as Project
  } catch {
    return null
  }
}

export async function createTask(data: { title: string; description: string; type: string; project_id?: string }): Promise<Task> {
  const dir = join(DATA_PATH, 'active')
  await mkdir(dir, { recursive: true })
  const id = `task-${Date.now()}`
  const task: Task = {
    task_id: id,
    title: data.title,
    description: data.description,
    type: data.type,
    status: 'pending',
    owner: null,
    project_id: data.project_id || null,
    depends_on: [],
    output_path: null,
    deadline_minutes: null,
    blocked_on: null,
    human_input: null,
    created_at: new Date().toISOString(),
    claimed_at: null,
    completed_at: null,
    metadata: {},
    log: [{ ts: new Date().toISOString(), event: 'created', agent: 'dashboard', detail: 'Task created via dashboard' }],
  }
  await writeFile(join(dir, `${id}.json`), JSON.stringify(task, null, 2))
  return task
}

export async function updateTask(id: string, updates: Partial<Task>): Promise<Task | null> {
  const task = await getTask(id)
  if (!task) return null
  const updated = { ...task, ...updates }
  const subdir = updated.status === 'completed' || updated.status === 'failed' ? 'archive' : 'active'
  await writeFile(join(DATA_PATH, subdir, `${id}.json`), JSON.stringify(updated, null, 2))
  return updated
}

export async function createProject(data: { title: string; description: string }): Promise<Project> {
  const dir = join(DATA_PATH, 'projects')
  await mkdir(dir, { recursive: true })
  const id = `proj-${Date.now()}`
  const project: Project = {
    project_id: id,
    title: data.title,
    description: data.description,
    tasks: [],
    created_at: new Date().toISOString(),
    status: 'active',
  }
  await writeFile(join(dir, `${id}.json`), JSON.stringify(project, null, 2))
  return project
}

export async function updateProject(id: string, updates: Partial<Project>): Promise<Project | null> {
  const project = await getProject(id)
  if (!project) return null
  const updated = { ...project, ...updates }
  await writeFile(join(DATA_PATH, 'projects', `${id}.json`), JSON.stringify(updated, null, 2))
  return updated
}

export async function provideInput(id: string, input: string): Promise<Task | null> {
  const task = await getTask(id)
  if (!task) return null
  task.human_input = { needed: task.human_input?.needed || '', provided: input }
  task.blocked_on = null
  task.status = 'pending'
  task.log.push({ ts: new Date().toISOString(), event: 'input_provided', agent: 'dashboard', detail: input })
  await writeFile(join(DATA_PATH, 'active', `${id}.json`), JSON.stringify(task, null, 2))
  return task
}
