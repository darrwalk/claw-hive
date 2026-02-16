'use client'

import { useState, useCallback, useMemo } from 'react'
import { ChevronRight, ChevronDown, Folder, File, Star, Search } from 'lucide-react'
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
  selectedPath: string | null
  onSelect: (path: string) => void
  onToggleFavorite: (path: string) => void
}

const TYPE_FILTERS: Record<string, string[]> = {
  Text: ['.md', '.txt', '.json', '.ts', '.js', '.py', '.yml', '.yaml', '.toml', '.sh', '.log', '.csv', '.xml', '.html', '.css'],
  Image: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'],
  Video: ['.mp4', '.webm'],
  PDF: ['.pdf'],
}

function extMatchesType(name: string, typeFilter: string | null): boolean {
  if (!typeFilter) return true
  const exts = TYPE_FILTERS[typeFilter]
  if (!exts) return true
  const dot = name.lastIndexOf('.')
  if (dot === -1) return false
  return exts.includes(name.slice(dot).toLowerCase())
}

function matchesFilters(name: string, filter: string, typeFilter: string | null): boolean {
  if (filter && !name.toLowerCase().includes(filter.toLowerCase())) return false
  if (!extMatchesType(name, typeFilter)) return false
  return true
}

function TreeNode({ path, entry, depth, selectedPath, expandedDirs, favorites, filter, typeFilter, onSelect, onToggle, onToggleFavorite }: {
  path: string
  entry: DirEntry
  depth: number
  selectedPath: string | null
  expandedDirs: Record<string, DirEntry[]>
  favorites: Favorite[]
  filter: string
  typeFilter: string | null
  onSelect: (path: string) => void
  onToggle: (path: string) => void
  onToggleFavorite: (path: string) => void
}) {
  const fullPath = `${path}/${entry.name}`
  const isDir = entry.type === 'directory'
  const isExpanded = fullPath in expandedDirs
  const isSelected = selectedPath === fullPath
  const isFavorited = favorites.some(f => f.path === fullPath)

  if (!isDir && !matchesFilters(entry.name, filter, typeFilter)) return null

  const children = isDir && isExpanded
    ? expandedDirs[fullPath]?.map(child => (
        <TreeNode
          key={child.name}
          path={fullPath}
          entry={child}
          depth={depth + 1}
          selectedPath={selectedPath}
          expandedDirs={expandedDirs}
          favorites={favorites}
          filter={filter}
          typeFilter={typeFilter}
          onSelect={onSelect}
          onToggle={onToggle}
          onToggleFavorite={onToggleFavorite}
        />
      ))
    : null

  return (
    <div>
      <div className="group flex items-center">
        <button
          onClick={() => isDir ? onToggle(fullPath) : onSelect(fullPath)}
          className={cn(
            'flex-1 flex items-center gap-1.5 py-1 px-2 text-xs rounded-md transition-colors text-left',
            isSelected ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {isDir ? (
            isExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />
          ) : <span className="w-3" />}
          {isDir ? <Folder className="h-3.5 w-3.5 shrink-0 text-blue-400" /> : <File className="h-3.5 w-3.5 shrink-0" />}
          <span className="truncate">{entry.name}</span>
        </button>
        {isDir && (
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
        )}
      </div>
      {children}
    </div>
  )
}

export default function FileTree({ agents, favorites, selectedPath, onSelect, onToggleFavorite }: FileTreeProps) {
  const [expandedDirs, setExpandedDirs] = useState<Record<string, DirEntry[]>>({})
  const [filter, setFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState<string | null>(null)

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

  const handleToggle = useCallback((path: string) => {
    toggleDir(path)
  }, [toggleDir])

  const hasActiveFilter = filter || typeFilter

  const agentsWithMatches = useMemo(() => {
    if (!hasActiveFilter) return new Set(agents)
    const matching = new Set<string>()
    for (const agent of agents) {
      if (!filter || agent.toLowerCase().includes(filter.toLowerCase())) {
        matching.add(agent)
        continue
      }
      // Check if any loaded children match
      for (const [dir, entries] of Object.entries(expandedDirs)) {
        if (dir === agent || dir.startsWith(agent + '/')) {
          if (entries.some(e => e.type === 'file' && matchesFilters(e.name, filter, typeFilter))) {
            matching.add(agent)
            break
          }
        }
      }
      // Always show agents that are expanded (user chose to open them)
      if (agent in expandedDirs) matching.add(agent)
    }
    return matching
  }, [agents, filter, typeFilter, expandedDirs, hasActiveFilter])

  const handleFavoriteClick = useCallback((fav: Favorite) => {
    const hasExtension = fav.path.includes('.') && fav.path.lastIndexOf('.') > fav.path.lastIndexOf('/')
    if (hasExtension) {
      onSelect(fav.path)
    } else {
      toggleDir(fav.path)
    }
  }, [onSelect, toggleDir])

  return (
    <div className="flex flex-col h-full border-r bg-card">
      <div className="p-2 border-b space-y-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filter files..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="w-full pl-7 pr-2 py-1.5 text-xs bg-secondary rounded-md border-0 focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setTypeFilter(null)}
            className={cn(
              'px-2 py-0.5 text-[10px] rounded-full transition-colors',
              !typeFilter ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
            )}
          >
            All
          </button>
          {Object.keys(TYPE_FILTERS).map(type => (
            <button
              key={type}
              onClick={() => setTypeFilter(typeFilter === type ? null : type)}
              className={cn(
                'px-2 py-0.5 text-[10px] rounded-full transition-colors',
                typeFilter === type ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
              )}
            >
              {type}
            </button>
          ))}
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
                  selectedPath === fav.path ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
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
          const isFavorited = favorites.some(f => f.path === agent)
          return (
            <div key={agent}>
              <div className="group flex items-center">
                <button
                  onClick={() => handleToggle(agent)}
                  className="flex-1 flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium rounded-md transition-colors text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
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
              {isExpanded && expandedDirs[agent]?.map(entry => (
                <TreeNode
                  key={entry.name}
                  path={agent}
                  entry={entry}
                  depth={1}
                  selectedPath={selectedPath}
                  expandedDirs={expandedDirs}
                  favorites={favorites}
                  filter={filter}
                  typeFilter={typeFilter}
                  onSelect={onSelect}
                  onToggle={handleToggle}
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
