import { getActiveTasks, groupByStatus, getActivityFeed, getStats } from '@/lib/tasks'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import Link from 'next/link'
import { AlertTriangle, Clock, User } from 'lucide-react'
import BlockedTaskActions from '@/components/BlockedTaskActions'

export const dynamic = 'force-dynamic'

const STATUS_COLORS: Record<string, string> = {
  total: 'border-l-4 border-l-primary',
  in_progress: 'border-l-4 border-l-blue-500',
  pending: 'border-l-4 border-l-yellow-500',
  blocked: 'border-l-4 border-l-orange-500',
  completed: 'border-l-4 border-l-green-500',
  failed: 'border-l-4 border-l-red-500',
}

export default async function Home() {
  const tasks = await getActiveTasks()
  const groups = groupByStatus(tasks)
  const stats = getStats(tasks)
  const feed = getActivityFeed(tasks).slice(0, 10)
  const blocked = groups.blocked ?? []

  const statCards = [
    { label: 'Total Active', value: stats.total, key: 'total' },
    { label: 'In Progress', value: stats.in_progress, key: 'in_progress' },
    { label: 'Pending', value: stats.pending, key: 'pending' },
    { label: 'Blocked', value: stats.blocked, key: 'blocked' },
    { label: 'Completed', value: stats.completed, key: 'completed' },
    { label: 'Failed', value: stats.failed, key: 'failed' },
  ]

  return (
    <div className="space-y-6">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Overview</h2>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map(s => (
          <Card key={s.key} className={STATUS_COLORS[s.key]}>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{s.label}</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-3xl font-bold font-mono">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {blocked.length > 0 && (
        <Card className="border-orange-500/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-orange-400">
              <AlertTriangle className="h-4 w-4" />
              Blocked Tasks ({blocked.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {blocked.map(task => (
              <div key={task.task_id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-md bg-orange-950/30 p-3">
                <div>
                  <Link href={`/tasks/${task.task_id}`} className="font-medium text-sm hover:text-primary transition-colors">
                    {task.title}
                  </Link>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Waiting on: <span className="text-orange-400 font-medium">{task.blocked_on ?? 'unknown'}</span>
                  </div>
                </div>
                {task.blocked_on === 'human' && (
                  <BlockedTaskActions taskId={task.task_id} needed={task.human_input?.needed} />
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {feed.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {feed.map((entry, i) => (
                  <div key={`${entry.task_id}-${entry.ts}-${i}`} className="flex items-start gap-3 text-sm">
                    <div className="text-xs text-muted-foreground whitespace-nowrap font-mono mt-0.5">
                      {new Date(entry.ts).toLocaleTimeString()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <Badge variant="secondary" className="text-[10px] mr-2">{entry.event}</Badge>
                      <Link href={`/tasks/${entry.task_id}`} className="text-xs text-muted-foreground hover:text-primary">
                        {entry.task_title}
                      </Link>
                      <div className="text-xs text-muted-foreground truncate mt-0.5">{entry.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {stats.agents.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Agents</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats.agents.map(agent => (
                  <div key={agent.owner} className="flex items-center justify-between rounded-md bg-secondary p-3">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium font-mono">{agent.owner}</span>
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      {agent.active > 0 && <span className="text-blue-400">{agent.active} active</span>}
                      <span className="text-green-400">{agent.completed} done</span>
                      {agent.failed > 0 && <span className="text-red-400">{agent.failed} failed</span>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {tasks.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">No active tasks</div>
      )}
    </div>
  )
}
