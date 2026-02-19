'use client'

import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { remarkFilePaths } from '@/lib/remarkFilePaths'

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
        <div className="prose prose-invert prose-sm max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkFilePaths]}
            components={{
              code({ className, children, ...props }) {
                const language = /language-(\w+)/.exec(className ?? '')?.[1]
                if (language) {
                  return (
                    <SyntaxHighlighter style={oneDark} language={language} PreTag="div">
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  )
                }
                return (
                  <code className="bg-secondary px-1 rounded text-sm font-mono" {...props}>
                    {children}
                  </code>
                )
              },
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      </CardContent>
    </Card>
  )
}
