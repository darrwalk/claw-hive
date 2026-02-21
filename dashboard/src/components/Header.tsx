'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Menu, Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface HeaderProps {
  onNewTask?: () => void
  onMenuToggle?: () => void
}

export default function Header({ onNewTask, onMenuToggle }: HeaderProps) {
  const router = useRouter()
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  useEffect(() => {
    setLastRefresh(new Date())
    const interval = setInterval(() => {
      router.refresh()
      setLastRefresh(new Date())
    }, 15_000)
    return () => clearInterval(interval)
  }, [router])

  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-3">
          <button onClick={onMenuToggle} className="md:hidden p-1 rounded-md hover:bg-secondary">
            <Menu className="h-5 w-5" />
          </button>
          <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3" />
            Updated {lastRefresh?.toLocaleTimeString()}
          </div>
        </div>
        <Button size="sm" onClick={onNewTask}>
          <Plus className="mr-1 h-4 w-4" />
          New Task
        </Button>
      </div>
    </header>
  )
}
