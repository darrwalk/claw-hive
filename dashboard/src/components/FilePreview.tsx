'use client'

import { useState, useEffect } from 'react'
import { Star, Download, FileText, ChevronRight, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Favorite } from '@/lib/workspace'

// --- Renderer strategy (Step 7: user contribution point) ---

type RendererType = 'markdown' | 'code' | 'image' | 'video' | 'download' | 'none'

interface RendererConfig {
  type: RendererType
  language?: string
}

function getRenderer(extension: string): RendererConfig {
  const ext = extension.toLowerCase()
  // TODO: User can customize this mapping to control what's previewable
  // vs download-only, add size limits for text files, image sizing, etc.
  const map: Record<string, RendererConfig> = {
    '.md': { type: 'markdown' },
    '.json': { type: 'code', language: 'json' },
    '.ts': { type: 'code', language: 'typescript' },
    '.tsx': { type: 'code', language: 'typescript' },
    '.js': { type: 'code', language: 'javascript' },
    '.jsx': { type: 'code', language: 'javascript' },
    '.py': { type: 'code', language: 'python' },
    '.yml': { type: 'code', language: 'yaml' },
    '.yaml': { type: 'code', language: 'yaml' },
    '.toml': { type: 'code', language: 'toml' },
    '.sh': { type: 'code', language: 'bash' },
    '.log': { type: 'code', language: 'text' },
    '.txt': { type: 'code', language: 'text' },
    '.csv': { type: 'code', language: 'text' },
    '.xml': { type: 'code', language: 'xml' },
    '.html': { type: 'code', language: 'html' },
    '.css': { type: 'code', language: 'css' },
    '.png': { type: 'image' },
    '.jpg': { type: 'image' },
    '.jpeg': { type: 'image' },
    '.gif': { type: 'image' },
    '.svg': { type: 'image' },
    '.webp': { type: 'image' },
    '.mp4': { type: 'video' },
    '.webm': { type: 'video' },
    '.pdf': { type: 'download' },
  }
  return map[ext] || { type: 'none' }
}

// --- Dynamic imports to avoid SSR issues ---

function MarkdownContent({ content }: { content: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [Md, setMd] = useState<any>(null)
  useEffect(() => {
    Promise.all([import('react-markdown'), import('remark-gfm')]).then(([rm, gfm]) => {
      setMd(() => ({ ReactMarkdown: rm.default, remarkGfm: gfm.default }))
    })
  }, [])
  if (!Md) return <div className="text-xs text-muted-foreground">Loading...</div>
  return (
    <div className="prose prose-invert prose-sm max-w-none">
      <Md.ReactMarkdown remarkPlugins={[Md.remarkGfm]}>{content}</Md.ReactMarkdown>
    </div>
  )
}

function CodeContent({ content, language }: { content: string; language: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [Highlighter, setHighlighter] = useState<any>(null)
  useEffect(() => {
    Promise.all([
      import('react-syntax-highlighter'),
      import('react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus'),
    ]).then(([rsh, style]) => {
      setHighlighter(() => ({ Prism: rsh.Prism, style: style.default }))
    })
  }, [])
  if (!Highlighter) return <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">{content}</pre>
  return (
    <Highlighter.Prism
      language={language}
      style={Highlighter.style}
      customStyle={{ margin: 0, borderRadius: '0.375rem', fontSize: '0.75rem', background: 'transparent' }}
    >
      {content}
    </Highlighter.Prism>
  )
}

// --- Main component ---

interface FilePreviewProps {
  path: string | null
  favorites: Favorite[]
  onToggleFavorite: (path: string) => void
  onBack?: () => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function FilePreview({ path, favorites, onToggleFavorite, onBack }: FilePreviewProps) {
  const [content, setContent] = useState<string | null>(null)
  const [mimeType, setMimeType] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isFavorited = path ? favorites.some(f => f.path === path) : false
  const extension = path ? '.' + (path.split('.').pop() || '') : ''
  const renderer = path ? getRenderer(extension) : { type: 'none' as const }

  useEffect(() => {
    if (!path) return
    const r = getRenderer('.' + (path.split('.').pop() || ''))
    if (r.type === 'image' || r.type === 'video' || r.type === 'download') {
      setContent(null)
      setMimeType(null)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    fetch(`/api/workspace/files/content?path=${encodeURIComponent(path)}`)
      .then(res => {
        if (!res.ok) throw new Error(`${res.status}`)
        return res.json()
      })
      .then(data => {
        setContent(data.content)
        setMimeType(data.mimeType)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [path])

  if (!path) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        <div className="text-center space-y-2">
          <FileText className="h-10 w-10 mx-auto opacity-30" />
          <p>Select a file to preview</p>
        </div>
      </div>
    )
  }

  const segments = path.split('/')
  const contentUrl = `/api/workspace/files/content?path=${encodeURIComponent(path)}`

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Header */}
      <div className="border-b px-4 py-2 flex items-center gap-2">
        {onBack && (
          <button
            onClick={onBack}
            className="p-1 rounded-md hover:bg-secondary transition-colors text-muted-foreground"
            title="Back to directory"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <div className="flex items-center gap-1 text-xs text-muted-foreground flex-1 min-w-0">
          {segments.map((seg, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 shrink-0" />}
              <span className={cn('truncate', i === segments.length - 1 && 'text-foreground font-medium')}>
                {seg}
              </span>
            </span>
          ))}
        </div>
        <button
          onClick={() => onToggleFavorite(path)}
          className="p-1.5 rounded-md hover:bg-secondary transition-colors"
          title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Star className={cn('h-4 w-4', isFavorited ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground')} />
        </button>
        {(renderer.type === 'download' || renderer.type === 'image' || renderer.type === 'video') && (
          <a
            href={contentUrl}
            download
            className="p-1.5 rounded-md hover:bg-secondary transition-colors text-muted-foreground"
            title="Download"
          >
            <Download className="h-4 w-4" />
          </a>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {loading && <div className="text-xs text-muted-foreground">Loading...</div>}
        {error && <div className="text-xs text-red-400">Error: {error}</div>}

        {!loading && !error && renderer.type === 'markdown' && content !== null && (
          <MarkdownContent content={content} />
        )}

        {!loading && !error && renderer.type === 'code' && content !== null && (
          <CodeContent content={content} language={renderer.language || 'text'} />
        )}

        {renderer.type === 'image' && (
          <div className="flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={contentUrl} alt={segments[segments.length - 1]} className="max-w-full max-h-[70vh] rounded-md" />
          </div>
        )}

        {renderer.type === 'video' && (
          <video src={contentUrl} controls className="max-w-full max-h-[70vh] rounded-md">
            Your browser does not support video playback.
          </video>
        )}

        {renderer.type === 'download' && (
          <div className="text-center py-12 space-y-3">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground opacity-30" />
            <p className="text-sm text-muted-foreground">Preview not available for this file type</p>
            <a
              href={contentUrl}
              download
              className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-secondary rounded-md hover:bg-secondary/80 transition-colors"
            >
              <Download className="h-4 w-4" />
              Download
            </a>
          </div>
        )}

        {renderer.type === 'none' && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            <FileText className="h-12 w-12 mx-auto opacity-30 mb-3" />
            Preview not available
          </div>
        )}
      </div>
    </div>
  )
}
