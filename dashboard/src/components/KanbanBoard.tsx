import { Task } from '@/lib/tasks'
import TaskCard from './TaskCard'

const COLUMNS = [
  { key: 'pending', label: 'Pending' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'completed', label: 'Completed' },
  { key: 'failed', label: 'Failed' },
] as const

interface Props {
  groups: Record<string, Task[]>
}

export default function KanbanBoard({ groups }: Props) {
  return (
    <div className="kanban">
      {COLUMNS.map(col => (
        <div key={col.key} className="kanban-column">
          <div className="kanban-header">
            <span>{col.label}</span>
            <span className="count">{groups[col.key]?.length ?? 0}</span>
          </div>
          <div className="kanban-body">
            {(groups[col.key] ?? []).map(task => (
              <TaskCard key={task.task_id} task={task} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
