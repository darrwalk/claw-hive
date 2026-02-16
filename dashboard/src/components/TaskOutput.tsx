'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function TaskOutput({ taskId }: { taskId: string }) {
  const [content, setContent] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/tasks/${taskId}/output`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.content) setContent(data.content) })
      .catch(() => {})
  }, [taskId])

  if (!content) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Output</CardTitle>
      </CardHeader>
      <CardContent>
        <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-mono bg-secondary rounded-md p-4 overflow-x-auto">
          {content}
        </pre>
      </CardContent>
    </Card>
  )
}
