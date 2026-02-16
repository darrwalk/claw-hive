'use client'

import { useState, useCallback, useMemo } from 'react'
import { ChevronRight, ChevronDown, Folder, Star, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Favorite } from '@/lib/workspace'

interface DirEntry {
  name: string
  type: 'file' | 'directory'
  size: number
  modified: string
}

interface FileTreeProps {
  agents: string[]
  favorites: Favorite[]
  selectedDir: string | null
  onSelectDir: (path: string) => void
  onToggleFavorite: (path: string) => void
}

function TreeNode({ path, entry, depth, selectedDir, expandedDirs, favorites, filter, onSelectDir, onToggle, onToggleFavorite }: {
  path: string
  entry: DirEntry
  depth: number
  selectedDir: string | null
  expandedDirs: Record<string, DirEntry[]>
  favorites: Favorite[]
  filter: string
  onSelectDir: (path: string) => void
  onToggle: (path: string) => void
  onToggleFavorite: (path: string) => void
}) {
  const fullPath = `${path}/${entry.name}`
  if (entry.type !== 'directory') return null
  if (filter && !entry.name.toLowerCase().includes(filter.toLowerCase())) return null

  const isExpanded = fullPath in expandedDirs
  const isSelected = selectedDir === fullPath
  const isFavorited = favorites.some(f => f.path === fullPath)

  const children = isExpanded
    ? expandedDirs[fullPath]
        ?.filter(child => child.type === 'directory')
        .map(child => (
          <TreeNode
            key={child.name}
            path={fullPath}
            entry={child}
            depth={depth + 1}
            selectedDir={selectedDir}
            expandedDirs={expandedDirs}
            favorites={favorites}
            filter={filter}
            onSelectDir={onSelectDir}
            onToggle={onToggle}
            onToggleFavorite={onToggleFavorite}
          />
        ))
    : null

  return (
    <div>
      <div className="group flex items-center">
        <button
          onClick={() => { onSelectDir(fullPath); if (!isExpanded) onToggle(fullPath) }}
          className={cn(
            'flex-1 flex items-center gap-1.5 py-1 px-2 text-xs rounded-md transition-colors text-left',
            isSelected ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {isExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
          <Folder className="h-3.5 w-3.5 shrink-0 text-blue-400" />
          <span className="truncate">{entry.name}</span>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(fullPath) }}
          className={cn(
            'p-1 rounded transition-colors shrink-0',
            isFavorited ? '' : 'opacity-0 group-hover:opacity-100'
          )}
          title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Star className={cn('h-3 w-3', isFavorited ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground hover:text-yellow-500')} />
        </button>
      </div>
      {children}
    </div>
  )
}

export default function FileTree({ agents, favorites, selectedDir, onSelectDir, onToggleFavorite }: FileTreeProps) {
  const [expandedDirs, setExpandedDirs] = useState<Record<string, DirEntry[]>>({})
  const [filter, setFilter] = useState('')

  const toggleDir = useCallback(async (path: string) => {
    if (path in expandedDirs) {
      setExpandedDirs(prev => {
        const next = { ...prev }
        for (const key of Object.keys(next)) {
          if (key === path || key.startsWith(path + '/')) delete next[key]
        }
        return next
      })
      return
    }
    const res = await fetch(`/api/workspace/files?path=${encodeURIComponent(path)}`)
    if (!res.ok) return
    const entries: DirEntry[] = await res.json()
    setExpandedDirs(prev => ({ ...prev, [path]: entries }))
  }, [expandedDirs])

  const expandToPath = useCallback(async (targetPath: string) => {
    const parts = targetPath.split('/')
    for (let i = 1; i <= parts.length; i++) {
      const partial = parts.slice(0, i).join('/')
      if (!(partial in expandedDirs)) {
        const res = await fetch(`/api/workspace/files?path=${encodeURIComponent(partial)}`)
        if (!res.ok) break
        const entries: DirEntry[] = await res.json()
        setExpandedDirs(prev => ({ ...prev, [partial]: entries }))
      }
    }
  }, [expandedDirs])

  const agentsWithMatches = useMemo(() => {
    if (!filter) return new Set(agents)
    const matching = new Set<string>()
    for (const agent of agents) {
      if (agent.toLowerCase().includes(filter.toLowerCase())) {
        matching.add(agent)
        continue
      }
      for (const [dir, entries] of Object.entries(expandedDirs)) {
        if (dir === agent || dir.startsWith(agent + '/')) {
          if (entries.some(e => e.type === 'directory' && e.name.toLowerCase().includes(filter.toLowerCase()))) {
            matching.add(agent)
            break
          }
        }
      }
      if (agent in expandedDirs) matching.add(agent)
    }
    return matching
  }, [agents, filter, expandedDirs])

  const handleFavoriteClick = useCallback((fav: Favorite) => {
    const hasExtension = fav.path.includes('.') && fav.path.lastIndexOf('.') > fav.path.lastIndexOf('/')
    if (hasExtension) {
      // File bookmark — select its parent directory, parent will handle file selection
      const parentDir = fav.path.substring(0, fav.path.lastIndexOf('/'))
      onSelectDir(parentDir)
      expandToPath(parentDir)
    } else {
      // Directory bookmark — select it and expand
      onSelectDir(fav.path)
      expandToPath(fav.path)
    }
  }, [onSelectDir, expandToPath])

  return (
    <div className="flex flex-col h-full border-r bg-card">
      <div className="p-2 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filter folders..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="w-full pl-7 pr-2 py-1.5 text-xs bg-secondary rounded-md border-0 focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-1.5 space-y-2">
        {favorites.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Star className="h-3 w-3" />
              Favorites
            </div>
            {favorites.map(fav => (
              <button
                key={fav.path}
                onClick={() => handleFavoriteClick(fav)}
                className={cn(
                  'w-full flex items-center gap-1.5 py-1 px-2 text-xs rounded-md transition-colors text-left',
                  selectedDir === fav.path ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                )}
              >
                <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 shrink-0" />
                <span className="truncate">{fav.label}</span>
              </button>
            ))}
          </div>
        )}

        {agents.filter(a => agentsWithMatches.has(a)).map(agent => {
          const isExpanded = agent in expandedDirs
          const isSelected = selectedDir === agent
          const isFavorited = favorites.some(f => f.path === agent)
          return (
            <div key={agent}>
              <div className="group flex items-center">
                <button
                  onClick={() => { onSelectDir(agent); if (!isExpanded) toggleDir(agent) }}
                  className={cn(
                    'flex-1 flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium rounded-md transition-colors',
                    isSelected ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                  )}
                >
                  {isExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                  <Folder className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                  <span className="truncate">{agent}</span>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleFavorite(agent) }}
                  className={cn(
                    'p-1 rounded transition-colors shrink-0',
                    isFavorited ? '' : 'opacity-0 group-hover:opacity-100'
                  )}
                  title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <Star className={cn('h-3 w-3', isFavorited ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground hover:text-yellow-500')} />
                </button>
              </div>
              {isExpanded && expandedDirs[agent]
                ?.filter(entry => entry.type === 'directory')
                .map(entry => (
                  <TreeNode
                    key={entry.name}
                    path={agent}
                    entry={entry}
                    depth={1}
                    selectedDir={selectedDir}
                    expandedDirs={expandedDirs}
                    favorites={favorites}
                    filter={filter}
                    onSelectDir={onSelectDir}
                    onToggle={toggleDir}
                    onToggleFavorite={onToggleFavorite}
                  />
                ))}
            </div>
          )
        })}

        {agentsWithMatches.size === 0 && (
          <div className="text-center py-8 text-muted-foreground text-xs">
            {agents.length === 0 ? 'No agents found' : 'No matches'}
          </div>
        )}
      </div>
    </div>
  )
}
