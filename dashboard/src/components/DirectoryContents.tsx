'use client'

import { useState, useEffect, useMemo } from 'react'
import { Folder, File, FileText, Image, Video, Star, Search, ChevronRight, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Favorite } from '@/lib/workspace'

interface DirEntry {
  name: string
  type: 'file' | 'directory'
  size: number
  modified: string
}

interface DirectoryContentsProps {
  path: string | null
  favorites: Favorite[]
  onNavigateDir: (path: string) => void
  onSelectFile: (path: string) => void
  onToggleFavorite: (path: string) => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function getFileIcon(name: string) {
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : ''
  if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].includes(ext)) return Image
  if (['.mp4', '.webm'].includes(ext)) return Video
  if (['.md', '.txt', '.pdf'].includes(ext)) return FileText
  return File
}

export default function DirectoryContents({ path, favorites, onNavigateDir, onSelectFile, onToggleFavorite }: DirectoryContentsProps) {
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')

  const isFavorited = path ? favorites.some(f => f.path === path) : false

  useEffect(() => {
    if (!path) { setEntries([]); return }
    setLoading(true)
    setFilter('')
    fetch(`/api/workspace/files?path=${encodeURIComponent(path)}`)
      .then(r => r.ok ? r.json() : [])
      .then(setEntries)
      .finally(() => setLoading(false))
  }, [path])

  const filtered = useMemo(() => {
    if (!filter) return entries
    return entries.filter(e => e.name.toLowerCase().includes(filter.toLowerCase()))
  }, [entries, filter])

  if (!path) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        <div className="text-center space-y-2">
          <Folder className="h-10 w-10 mx-auto opacity-30" />
          <p>Select a folder to browse</p>
        </div>
      </div>
    )
  }

  const segments = path.split('/')
  const parentPath = segments.length > 1 ? segments.slice(0, -1).join('/') : null

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Header */}
      <div className="border-b px-4 py-2 flex items-center gap-2">
        {parentPath && (
          <button
            onClick={() => onNavigateDir(parentPath)}
            className="p-1 rounded-md hover:bg-secondary transition-colors text-muted-foreground"
            title="Go up"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <div className="flex items-center gap-1 text-xs text-muted-foreground flex-1 min-w-0">
          {segments.map((seg, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 shrink-0" />}
              <button
                onClick={() => onNavigateDir(segments.slice(0, i + 1).join('/'))}
                className={cn(
                  'truncate hover:text-foreground transition-colors',
                  i === segments.length - 1 && 'text-foreground font-medium'
                )}
              >
                {seg}
              </button>
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
      </div>

      {/* Filter */}
      <div className="px-4 py-2 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filter contents..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="w-full pl-7 pr-2 py-1.5 text-xs bg-secondary rounded-md border-0 focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Content list */}
      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="text-center py-8 text-xs text-muted-foreground">Loading...</div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-8 text-xs text-muted-foreground">
            {entries.length === 0 ? 'Empty directory' : 'No matches'}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="text-left px-4 py-2 font-medium">Name</th>
                <th className="text-right px-4 py-2 font-medium w-20">Size</th>
                <th className="text-right px-4 py-2 font-medium w-28">Modified</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(entry => {
                const isDir = entry.type === 'directory'
                const Icon = isDir ? Folder : getFileIcon(entry.name)
                return (
                  <tr
                    key={entry.name}
                    onDoubleClick={() => isDir ? onNavigateDir(`${path}/${entry.name}`) : onSelectFile(`${path}/${entry.name}`)}
                    onClick={() => isDir ? undefined : onSelectFile(`${path}/${entry.name}`)}
                    className="border-b border-border/50 hover:bg-secondary/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Icon className={cn('h-4 w-4 shrink-0', isDir ? 'text-blue-400' : 'text-muted-foreground')} />
                        <span className={cn('truncate', isDir && 'font-medium')}>{entry.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right text-muted-foreground">
                      {isDir ? '—' : formatSize(entry.size)}
                    </td>
                    <td className="px-4 py-2 text-right text-muted-foreground">
                      {formatDate(entry.modified)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
