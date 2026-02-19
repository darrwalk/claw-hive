import { getTask, getActiveTasks, getProject, formatDuration } from '@/lib/tasks'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import TaskActions from '@/components/TaskActions'
import TaskOutput from '@/components/TaskOutput'
import ExecutionTimeline from '@/components/ExecutionTimeline'

export const dynamic = 'force-dynamic'

const STATUS_BADGES: Record<string, string> = {
  pending: 'bg-yellow-950 text-yellow-400 border-yellow-800',
  in_progress: 'bg-blue-950 text-blue-400 border-blue-800',
  blocked: 'bg-orange-950 text-orange-400 border-orange-800',
  completed: 'bg-green-950 text-green-400 border-green-800',
  failed: 'bg-red-950 text-red-400 border-red-800',
  abandoned: 'bg-zinc-950 text-zinc-400 border-zinc-800',
}

export default async function TaskDetailPage({ params }: { params: { id: string } }) {
  const task = await getTask(params.id)
  if (!task) notFound()

  const allTasks = await getActiveTasks()
  const depTasks = task.depends_on.map(id => allTasks.find(t => t.task_id === id)).filter(Boolean)
  const project = task.project_id ? await getProject(task.project_id) : null
  const duration = formatDuration(task.created_at, task.completed_at)

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/tasks" className="hover:text-primary">Task Board</Link>
        <span>/</span>
        <span className="font-mono">{task.task_id}</span>
      </div>

      <div>
        <h1 className="text-xl font-semibold">{task.title}</h1>
        <div className="flex flex-wrap gap-2 mt-3">
          <Badge className={STATUS_BADGES[task.status]}>{task.status.replace('_', ' ')}</Badge>
          <Badge variant="secondary">{task.type}</Badge>
          {task.owner && <Badge variant="outline">{task.owner}</Badge>}
          <Badge variant="outline" className="font-mono">{duration}</Badge>
          {task.deadline_minutes ? (
            <Badge variant="outline" className="font-mono">{task.deadline_minutes}min deadline</Badge>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Description</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{task.description}</p>
        </CardContent>
      </Card>

      <TaskOutput taskId={task.task_id} />

      {task.log.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Execution Timeline</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <ExecutionTimeline log={task.log} />
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-muted-foreground">Created:</span>{' '}
          <span className="font-mono">{new Date(task.created_at).toLocaleString()}</span>
        </div>
        {task.claimed_at && (
          <div>
            <span className="text-muted-foreground">Claimed:</span>{' '}
            <span className="font-mono">{new Date(task.claimed_at).toLocaleString()}</span>
          </div>
        )}
        {task.completed_at && (
          <div>
            <span className="text-muted-foreground">Completed:</span>{' '}
            <span className="font-mono">{new Date(task.completed_at).toLocaleString()}</span>
          </div>
        )}
        {task.project_id && (
          <div>
            <span className="text-muted-foreground">Project:</span>{' '}
            <Link href="/projects" className="hover:text-primary font-mono">
              {project?.title || task.project_id}
            </Link>
          </div>
        )}
        {task.output_path && (
          <div>
            <span className="text-muted-foreground">Output:</span>{' '}
            <span className="font-mono">{task.output_path}</span>
          </div>
        )}
        {task.blocked_on && (
          <div>
            <span className="text-muted-foreground">Blocked on:</span>{' '}
            <span className="font-mono">{task.blocked_on}</span>
          </div>
        )}
        {task.human_input?.needed && (
          <div>
            <span className="text-muted-foreground">Human input needed:</span>{' '}
            <span className="font-mono">{task.human_input.needed}</span>
          </div>
        )}
        {task.human_input?.provided && (
          <div>
            <span className="text-muted-foreground">Human input response:</span>{' '}
            <span className="font-mono">{task.human_input.provided}</span>
          </div>
        )}
        {task.metadata && Object.entries(task.metadata).map(([key, value]) => (
          <div key={key}>
            <span className="text-muted-foreground">{key}:</span>{' '}
            <span className="font-mono">{value}</span>
          </div>
        ))}
      </div>

      {depTasks.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Dependencies</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {depTasks.map(dep => dep && (
              <div key={dep.task_id} className="flex items-center justify-between rounded-md bg-secondary p-3">
                <Link href={`/tasks/${dep.task_id}`} className="text-sm hover:text-primary">
                  {dep.title}
                </Link>
                <Badge className={STATUS_BADGES[dep.status]} variant="outline">
                  {dep.status.replace('_', ' ')}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <TaskActions task={task} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Activity Log ({task.log.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...task.log].reverse().map((entry, i) => (
              <div key={`${entry.ts}-${i}`} className="flex items-start gap-3 text-sm">
                <div className="text-xs text-muted-foreground whitespace-nowrap font-mono mt-0.5">
                  {new Date(entry.ts).toLocaleString()}
                </div>
                <Badge variant="secondary" className="text-[10px] shrink-0">{entry.event}</Badge>
                {entry.agent && (
                  <span className="text-xs text-muted-foreground font-mono shrink-0">[{entry.agent}]</span>
                )}
                <span className="text-sm text-muted-foreground">{entry.detail}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
