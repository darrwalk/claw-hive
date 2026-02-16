'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Project } from '@/lib/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

interface Props {
  project: Project
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function EditProjectDialog({ project, open, onOpenChange }: Props) {
  const router = useRouter()
  const [title, setTitle] = useState(project.title)
  const [description, setDescription] = useState(project.description)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await fetch(`/api/projects/${project.project_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description }),
      })
      router.refresh()
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">Title</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!title.trim() || loading}>Save</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
