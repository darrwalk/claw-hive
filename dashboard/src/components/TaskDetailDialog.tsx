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

  useEffect(() => {
    if (open && task.project_id) {
      fetch(`/api/projects/${task.project_id}`).then(r => r.json()).then(data => {
        setProjectTitle(data.title || null)
      }).catch(() => setProjectTitle(null))
    }
  }, [open, task.project_id])

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
            <div className="text-sm">
              <span className="text-muted-foreground">Depends on: </span>
              {task.depends_on.map(d => (
                <span key={d} className="font-mono text-xs mr-2">{d}</span>
              ))}
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
