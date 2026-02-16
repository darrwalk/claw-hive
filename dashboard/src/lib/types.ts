export interface LogEntry {
  ts: string
  event: string
  agent: string
  detail: string
}

export interface HumanInput {
  needed: string
  provided: string | null
}

export interface Task {
  task_id: string
  title: string
  description: string
  type: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked' | 'abandoned'
  owner: string | null
  project_id: string | null
  depends_on: string[]
  output_path: string | null
  deadline_minutes: number | null
  blocked_on: string | null
  human_input: HumanInput | null
  created_at: string
  claimed_at: string | null
  completed_at: string | null
  metadata: Record<string, string>
  log: LogEntry[]
}

export interface Project {
  project_id: string
  title: string
  description: string
  tasks: { task_id: string; title: string; type: string }[]
  created_at: string
  status: string
}

export type TaskStatus = Task['status']

export function groupByStatus(tasks: Task[]): Record<string, Task[]> {
  const groups: Record<string, Task[]> = {
    pending: [],
    in_progress: [],
    blocked: [],
    completed: [],
    failed: [],
  }
  for (const task of tasks) {
    const key = task.status === 'abandoned' ? 'failed' : (task.status in groups ? task.status : 'pending')
    groups[key].push(task)
  }
  return groups
}

export function getActivityFeed(tasks: Task[]): (LogEntry & { task_id: string; task_title: string })[] {
  const entries = tasks.flatMap(task =>
    task.log.map(entry => ({
      ...entry,
      task_id: task.task_id,
      task_title: task.title,
    }))
  )
  return entries.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
}

export function getStats(tasks: Task[]) {
  const groups = groupByStatus(tasks)
  const owners = new Set(tasks.map(t => t.owner).filter(Boolean))
  const agents = [...owners].map(owner => {
    const agentTasks = tasks.filter(t => t.owner === owner)
    return {
      owner,
      total: agentTasks.length,
      active: agentTasks.filter(t => t.status === 'in_progress').length,
      completed: agentTasks.filter(t => t.status === 'completed').length,
      failed: agentTasks.filter(t => t.status === 'failed').length,
    }
  })

  return {
    total: tasks.length,
    pending: groups.pending.length,
    in_progress: groups.in_progress.length,
    blocked: groups.blocked.length,
    completed: groups.completed.length,
    failed: groups.failed.length,
    agents,
  }
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
