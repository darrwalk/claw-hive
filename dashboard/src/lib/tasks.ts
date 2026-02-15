import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const HIVE_DATA_PATH = process.env.HIVE_DATA_PATH || '/app/data/hive';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked';

export interface LogEntry {
  ts: string;
  event: string;
  agent: string | null;
  detail: string;
}

export interface Task {
  task_id: string;
  title: string;
  description: string;
  type: string;
  status: TaskStatus;
  owner: string | null;
  project_id: string | null;
  depends_on: string[];
  output_path: string | null;
  deadline_minutes: number;
  blocked_on: string | null;
  human_input: { needed: string; provided: string | null } | null;
  created_at: string;
  claimed_at: string | null;
  completed_at: string | null;
  log: LogEntry[];
}

export interface Project {
  project_id: string;
  title: string;
  description: string;
  tasks: { task_id: string; title: string; type: string }[];
  created_at: string;
  status: string;
}

function readJsonFiles<T>(dir: string, prefix: string): T[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.startsWith(prefix) && f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(join(dir, f), 'utf-8')) as T);
}

export function getActiveTasks(): Task[] {
  return readJsonFiles<Task>(join(HIVE_DATA_PATH, 'active'), 'task-');
}

export function getArchivedTasks(): Task[] {
  return readJsonFiles<Task>(join(HIVE_DATA_PATH, 'archive'), 'task-');
}

export function getProjects(): Project[] {
  return readJsonFiles<Project>(join(HIVE_DATA_PATH, 'projects'), 'project-');
}

export function getTaskCounts(tasks: Task[]): Record<TaskStatus, number> {
  const counts: Record<TaskStatus, number> = {
    pending: 0, in_progress: 0, blocked: 0, completed: 0, failed: 0,
  };
  for (const t of tasks) {
    counts[t.status] = (counts[t.status] || 0) + 1;
  }
  return counts;
}

export function getTaskDuration(task: Task): string {
  const start = task.claimed_at || task.created_at;
  const end = task.completed_at || new Date().toISOString();
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min}m`;
  const hrs = Math.floor(min / 60);
  return `${hrs}h ${min % 60}m`;
}
