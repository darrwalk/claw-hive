'use client'

import { useState } from 'react'
import { Project } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Pencil } from 'lucide-react'
import EditProjectDialog from '@/components/EditProjectDialog'

export default function ProjectEditButton({ project }: { project: Project }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(true)}>
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <EditProjectDialog project={project} open={open} onOpenChange={setOpen} />
    </>
  )
}
