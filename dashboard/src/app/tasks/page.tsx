import { getActiveTasks, groupByStatus } from '@/lib/tasks'
import KanbanBoard from '@/components/KanbanBoard'
import RefreshWrapper from '@/components/RefreshWrapper'

export const dynamic = 'force-dynamic'

export default async function TasksPage() {
  const tasks = await getActiveTasks()
  const groups = groupByStatus(tasks)

  return (
    <RefreshWrapper>
      <h2 className="section-title">Task Board</h2>
      {tasks.length === 0
        ? <div className="empty">No active tasks</div>
        : <KanbanBoard groups={groups} />
      }
    </RefreshWrapper>
  )
}
