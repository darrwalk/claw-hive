import Link from 'next/link'
import { Task, formatDuration } from '@/lib/types'
import { Badge } from '@/components/ui/badge'

export default function TaskCard({ task }: { task: Task }) {
  const lastLog = task.log[task.log.length - 1]
  const duration = formatDuration(task.created_at, task.completed_at)

  return (
    <Link href={`/tasks/${task.task_id}`} className="block">
      <div className="rounded-md border bg-background p-3 hover:border-muted-foreground transition-colors">
        <div className="text-sm font-medium leading-tight mb-2">{task.title}</div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary" className="text-[10px]">{task.type}</Badge>
          {task.owner && <Badge variant="outline" className="text-[10px]">{task.owner}</Badge>}
          <Badge variant="outline" className="text-[10px] font-mono">{duration}</Badge>
          {task.blocked_on && <Badge variant="outline" className="text-[10px] text-orange-400">blocked: {task.blocked_on}</Badge>}
        </div>
        {lastLog && (
          <div className="mt-2 pt-1.5 border-t text-[11px] text-muted-foreground truncate">
            {lastLog.detail}
          </div>
        )}
      </div>
    </Link>
  )
}
