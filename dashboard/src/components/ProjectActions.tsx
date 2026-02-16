'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Plus } from 'lucide-react'

export default function ProjectActions() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description }),
      })
      setTitle('')
      setDescription('')
      setOpen(false)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-4 w-4" />
        New Project
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Create Project</DialogTitle>
            <DialogDescription>Create a new project to group tasks.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="projectTitle">Title</Label>
              <Input id="projectTitle" value={title} onChange={e => setTitle(e.target.value)} placeholder="Project name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="projectDesc">Description</Label>
              <Textarea id="projectDesc" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={loading || !title}>
                {loading ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
