'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultProjectId?: string
}

export default function CreateTaskDialog({ open, onOpenChange, defaultProjectId }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState('research')
  const [projectId, setProjectId] = useState(defaultProjectId || '')
  const [projects, setProjects] = useState<{ project_id: string; title: string }[]>([])

  useEffect(() => {
    if (open) {
      fetch('/api/projects').then(r => r.json()).then(setProjects)
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          type,
          project_id: projectId || undefined,
        }),
      })
      setTitle('')
      setDescription('')
      setType('research')
      setProjectId('')
      onOpenChange(false)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
          <DialogDescription>Add a new task to the hive.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" value={description} onChange={e => setDescription(e.target.value)} placeholder="What needs to be done?" required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="research">Research</SelectItem>
                  <SelectItem value="dev">Development</SelectItem>
                  <SelectItem value="ops">Operations</SelectItem>
                  <SelectItem value="review">Review</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Project</Label>
              <Select value={projectId} onValueChange={v => setProjectId(v === '_none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {projects.map(p => (
                    <SelectItem key={p.project_id} value={p.project_id}>{p.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={loading || !title || !description}>
              {loading ? 'Creating...' : 'Create Task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
