import { getActiveTasks, groupByStatus } from '@/lib/tasks'
import KanbanBoard from '@/components/KanbanBoard'

export const dynamic = 'force-dynamic'

export default async function TasksPage() {
  const tasks = await getActiveTasks()
  const groups = groupByStatus(tasks)
  const owners = [...new Set(tasks.map(t => t.owner).filter(Boolean))] as string[]
  const types = [...new Set(tasks.map(t => t.type))]

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Task Board</h2>
      {tasks.length === 0
        ? <div className="text-center py-12 text-muted-foreground text-sm">No active tasks</div>
        : <KanbanBoard groups={groups} allTasks={tasks} owners={owners} types={types} />
      }
    </div>
  )
}
