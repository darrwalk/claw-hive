'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { HumanInput } from '@/lib/types'

interface Props {
  taskId: string
  needed?: string | null | HumanInput
}

export default function BlockedTaskActions({ taskId, needed }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const neededText = typeof needed === 'object' && needed !== null ? needed.needed : (needed || 'Human input required')

  async function handleProvide() {
    setLoading(true)
    try {
      await fetch(`/api/tasks/${taskId}/provide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      })
      setOpen(false)
      setInput('')
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" className="border-orange-500/50 text-orange-400 hover:bg-orange-950" onClick={() => setOpen(true)}>
        Provide Input
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Provide Human Input</DialogTitle>
            <DialogDescription>{neededText}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="humanInput">Your input</Label>
            <Textarea id="humanInput" value={input} onChange={e => setInput(e.target.value)} placeholder="Provide the requested input..." rows={4} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleProvide} disabled={loading || !input}>
              {loading ? 'Submitting...' : 'Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
