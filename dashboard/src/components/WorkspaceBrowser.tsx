'use client'

import { useState, useEffect, useCallback } from 'react'
import FileTree from './FileTree'
import FilePreview from './FilePreview'
import type { Favorite } from '@/lib/workspace'

interface WorkspaceBrowserProps {
  agents: string[]
}

export default function WorkspaceBrowser({ agents }: WorkspaceBrowserProps) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [favorites, setFavorites] = useState<Favorite[]>([])

  useEffect(() => {
    fetch('/api/workspace/favorites')
      .then(r => r.ok ? r.json() : [])
      .then(setFavorites)
  }, [])

  const toggleFavorite = useCallback(async (path: string) => {
    const isFav = favorites.some(f => f.path === path)
    const res = await fetch('/api/workspace/favorites', {
      method: isFav ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    })
    if (res.ok) setFavorites(await res.json())
  }, [favorites])

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-8rem)] border rounded-lg overflow-hidden bg-card">
      <div className="w-full md:w-72 shrink-0 overflow-hidden">
        <FileTree
          agents={agents}
          favorites={favorites}
          selectedPath={selectedPath}
          onSelect={setSelectedPath}
          onToggleFavorite={toggleFavorite}
        />
      </div>
      <FilePreview
        path={selectedPath}
        favorites={favorites}
        onToggleFavorite={toggleFavorite}
      />
    </div>
  )
}
