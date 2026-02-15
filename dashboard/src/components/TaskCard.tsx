import { Task, formatDuration } from '@/lib/tasks'

export default function TaskCard({ task }: { task: Task }) {
  const lastLog = task.log[task.log.length - 1]
  const duration = formatDuration(task.created_at, task.completed_at)

  return (
    <div className="task-card">
      <div className="title">{task.title}</div>
      <div className="meta">
        <span className="tag tag-type">{task.type}</span>
        {task.owner && <span className="tag tag-owner">{task.owner}</span>}
        <span className="tag tag-duration">{duration}</span>
        {task.blocked_on && <span className="tag tag-blocked">blocked: {task.blocked_on}</span>}
      </div>
      {lastLog && (
        <div className="last-log" title={lastLog.detail}>
          {lastLog.detail}
        </div>
      )}
    </div>
  )
}
