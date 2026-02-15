import { getActiveTasks, groupByStatus } from '@/lib/tasks'
import RefreshWrapper from '@/components/RefreshWrapper'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const tasks = await getActiveTasks()
  const groups = groupByStatus(tasks)
  const blocked = groups.blocked ?? []

  return (
    <RefreshWrapper>
      <h2 className="section-title">Overview</h2>
      <div className="stats">
        <div className="stat-card">
          <div className="label">Total Active</div>
          <div className="value">{tasks.length}</div>
        </div>
        <div className="stat-card">
          <div className="label">In Progress</div>
          <div className="value" style={{ color: 'var(--accent)' }}>{groups.in_progress?.length ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="label">Pending</div>
          <div className="value" style={{ color: 'var(--yellow)' }}>{groups.pending?.length ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="label">Blocked</div>
          <div className="value" style={{ color: 'var(--orange)' }}>{groups.blocked?.length ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="label">Completed</div>
          <div className="value" style={{ color: 'var(--green)' }}>{groups.completed?.length ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="label">Failed</div>
          <div className="value" style={{ color: 'var(--red)' }}>{groups.failed?.length ?? 0}</div>
        </div>
      </div>

      {blocked.length > 0 && (
        <div className="alerts">
          <h3 className="section-title">Blocked Tasks</h3>
          {blocked.map(task => (
            <div key={task.task_id} className="alert">
              <span className="alert-title">{task.title}</span>
              {' — '}
              waiting on: <strong>{task.blocked_on ?? 'unknown'}</strong>
              {task.human_input === null && task.blocked_on === 'human' && ' (needs human input)'}
            </div>
          ))}
        </div>
      )}

      {tasks.length === 0 && <div className="empty">No active tasks</div>}
    </RefreshWrapper>
  )
}
