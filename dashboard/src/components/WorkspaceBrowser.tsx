'use client'

import { useState, useEffect, useCallback } from 'react'
import FileTree from './FileTree'
import FilePreview from './FilePreview'
import DirectoryContents from './DirectoryContents'
import type { Favorite } from '@/lib/workspace'

interface WorkspaceBrowserProps {
  agents: string[]
  initialPath?: string | null
}

export default function WorkspaceBrowser({ agents, initialPath }: WorkspaceBrowserProps) {
  const [selectedDir, setSelectedDir] = useState<string | null>(initialPath ?? null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
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

  const handleSelectDir = useCallback((path: string) => {
    setSelectedDir(path)
    setSelectedFile(null)
  }, [])

  const handleSelectFile = useCallback((path: string) => {
    setSelectedFile(path)
  }, [])

  const handleBackToDir = useCallback(() => {
    setSelectedFile(null)
  }, [])

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-8rem)] border rounded-lg overflow-hidden bg-card">
      <div className="w-full md:w-72 shrink-0 overflow-hidden">
        <FileTree
          agents={agents}
          favorites={favorites}
          selectedDir={selectedDir}
          onSelectDir={handleSelectDir}
          onToggleFavorite={toggleFavorite}
        />
      </div>
      {selectedFile ? (
        <FilePreview
          path={selectedFile}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          onBack={handleBackToDir}
        />
      ) : (
        <DirectoryContents
          path={selectedDir}
          favorites={favorites}
          onNavigateDir={handleSelectDir}
          onSelectFile={handleSelectFile}
          onToggleFavorite={toggleFavorite}
        />
      )}
    </div>
  )
}
