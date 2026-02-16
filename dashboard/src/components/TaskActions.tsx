'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Task } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

export default function TaskActions({ task }: { task: Task }) {
  const router = useRouter()
  const [logMessage, setLogMessage] = useState('')
  const [humanInput, setHumanInput] = useState('')
  const [loading, setLoading] = useState(false)

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

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {(task.status === 'completed' || task.status === 'failed') && (
          <Button
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={() => handleUpdate({ status: 'pending' })}
          >
            Redo
          </Button>
        )}

        <div className="flex gap-2 items-end">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Add Log Entry</Label>
            <Input value={logMessage} onChange={e => setLogMessage(e.target.value)} placeholder="Log message" />
          </div>
          <Button size="sm" disabled={!logMessage || loading} onClick={() => { handleUpdate({ log: logMessage }); setLogMessage('') }}>
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
      </CardContent>
    </Card>
  )
}
