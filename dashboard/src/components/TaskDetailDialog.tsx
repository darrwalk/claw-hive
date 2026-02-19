'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Task, formatDuration } from '@/lib/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ExternalLink } from 'lucide-react'
import Link from 'next/link'

const STATUS_BADGES: Record<string, string> = {
  pending: 'bg-yellow-950 text-yellow-400 border-yellow-800',
  in_progress: 'bg-blue-950 text-blue-400 border-blue-800',
  blocked: 'bg-orange-950 text-orange-400 border-orange-800',
  completed: 'bg-green-950 text-green-400 border-green-800',
  failed: 'bg-red-950 text-red-400 border-red-800',
  abandoned: 'bg-zinc-950 text-zinc-400 border-zinc-800',
}

interface Props {
  task: Task
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function TaskDetailDialog({ task, open, onOpenChange }: Props) {
  const router = useRouter()
  const [logMessage, setLogMessage] = useState('')
  const [humanInput, setHumanInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [projectTitle, setProjectTitle] = useState<string | null>(null)
  const [depTasks, setDepTasks] = useState<Task[]>([])
  const [depMissing, setDepMissing] = useState<string[]>([])
  const [depsLoading, setDepsLoading] = useState(false)

  useEffect(() => {
    if (open && task.project_id) {
      fetch(`/api/projects/${task.project_id}`).then(r => r.json()).then(data => {
        setProjectTitle(data.title || null)
      }).catch(() => setProjectTitle(null))
    }
  }, [open, task.project_id])

  useEffect(() => {
    if (!open || task.depends_on.length === 0) {
      setDepTasks([])
      setDepMissing([])
      return
    }
    setDepsLoading(true)
    Promise.all(
      task.depends_on.map(id =>
        fetch(`/api/tasks/${id}`)
          .then(async r => r.ok ? { id, task: await r.json() as Task } : { id, task: null as Task | null })
          .catch(() => ({ id, task: null }))
      )
    ).then(results => {
      setDepTasks(results.filter(r => r.task !== null).map(r => r.task as Task))
      setDepMissing(results.filter(r => r.task === null).map(r => r.id))
    }).finally(() => setDepsLoading(false))
  }, [open, task.task_id, task.depends_on])

  async function handleUpdate(body: Record<string, string>) {
    setLoading(true)
    try {
      await fetch(`/api/tasks/${task.task_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function handleProvideInput() {
    setLoading(true)
    try {
      await fetch(`/api/tasks/${task.task_id}/provide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: humanInput }),
      })
      setHumanInput('')
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  const duration = formatDuration(task.created_at, task.completed_at)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-lg">{task.title}</DialogTitle>
              <DialogDescription className="font-mono text-xs mt-1">{task.task_id}</DialogDescription>
            </div>
            <Link href={`/tasks/${task.task_id}`} onClick={() => onOpenChange(false)}>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ExternalLink className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge className={STATUS_BADGES[task.status]}>{task.status.replace('_', ' ')}</Badge>
            <Badge variant="secondary">{task.type}</Badge>
            {task.owner && <Badge variant="outline">{task.owner}</Badge>}
            {projectTitle && <Badge variant="outline">{projectTitle}</Badge>}
            <Badge variant="outline" className="font-mono">{duration}</Badge>
          </div>

          <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{task.description}</p>

          {task.depends_on.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground">Dependencies</span>
              {depsLoading ? (
                <div className="text-xs text-muted-foreground">Loading dependencies...</div>
              ) : (
                <div className="space-y-1">
                  {depTasks.map(dep => (
                    <div key={dep.task_id} className="flex items-center justify-between rounded-md bg-secondary p-2">
                      <Link
                        href={`/tasks/${dep.task_id}`}
                        className="text-sm hover:text-primary flex-1 truncate"
                        onClick={() => onOpenChange(false)}
                      >
                        {dep.title}
                      </Link>
                      <Badge className={STATUS_BADGES[dep.status]} variant="outline">
                        {dep.status.replace('_', ' ')}
                      </Badge>
                    </div>
                  ))}
                  {depMissing.map(id => (
                    <div key={id} className="flex items-center justify-between rounded-md bg-secondary p-2">
                      <span className="text-sm font-mono text-muted-foreground flex-1 truncate">{id}</span>
                      <Badge variant="outline" className="bg-zinc-950 text-zinc-400 border-zinc-800">
                        archived
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <Separator />

          {/* Actions */}
          <div className="space-y-3">
            {(task.status === 'completed' || task.status === 'failed' || task.status === 'abandoned') && (
              <Button
                size="sm"
                variant="outline"
                disabled={loading}
                onClick={() => handleUpdate({ status: 'pending' })}
              >
                Redo
              </Button>
            )}

            {task.status === 'blocked' && (
              <Button
                size="sm"
                variant="outline"
                disabled={loading}
                className="text-zinc-400 border-zinc-700 hover:bg-zinc-900"
                onClick={() => handleUpdate({ status: 'abandoned' })}
              >
                Abandon
              </Button>
            )}

            <div className="flex gap-2 items-end">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Add Log Entry</Label>
                <Input value={logMessage} onChange={e => setLogMessage(e.target.value)} placeholder="Log message" />
              </div>
              <Button
                size="sm"
                disabled={!logMessage || loading}
                onClick={() => { handleUpdate({ log: logMessage }); setLogMessage('') }}
              >
                Log
              </Button>
            </div>

            {task.status === 'blocked' && task.blocked_on === 'human' && (
              <div className="space-y-2 rounded-md border border-orange-800 p-3 bg-orange-950/20">
                <Label className="text-xs text-orange-400">Provide Human Input</Label>
                {task.human_input?.needed && (
                  <p className="text-xs text-muted-foreground">Needs: {task.human_input.needed}</p>
                )}
                <Textarea value={humanInput} onChange={e => setHumanInput(e.target.value)} placeholder="Your input..." rows={3} />
                <Button size="sm" disabled={!humanInput || loading} onClick={handleProvideInput}>
                  Submit Input
                </Button>
              </div>
            )}
          </div>

          <Separator />

          {/* Log */}
          <div>
            <h4 className="text-sm font-medium mb-2">Activity Log ({task.log.length})</h4>
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {[...task.log].reverse().map((entry, i) => (
                <div key={`${entry.ts}-${i}`} className="text-xs flex gap-2">
                  <span className="text-muted-foreground whitespace-nowrap font-mono">
                    {new Date(entry.ts).toLocaleString()}
                  </span>
                  <Badge variant="secondary" className="text-[10px] shrink-0">{entry.event}</Badge>
                  <span className="text-muted-foreground break-words">{entry.detail}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
