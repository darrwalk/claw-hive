'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, KanbanSquare, Activity, FolderKanban, FolderOpen, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/tasks', label: 'Task Board', icon: KanbanSquare },
  { href: '/activity', label: 'Activity', icon: Activity },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/workspace', label: 'Workspace', icon: FolderOpen },
]

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname()

  const nav = (
    <aside className={cn(
      'fixed left-0 top-0 z-40 h-screen w-56 border-r bg-card flex flex-col transition-transform duration-200',
      open ? 'translate-x-0' : '-translate-x-full',
      'md:translate-x-0'
    )}>
      <div className="p-4 border-b flex items-center justify-between">
        <Link href="/" className="text-lg font-bold font-mono text-foreground hover:text-primary transition-colors">
          claw-hive
        </Link>
        <button onClick={onClose} className="md:hidden p-1 rounded-md hover:bg-secondary">
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {NAV_ITEMS.map(item => {
          const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className="p-3 border-t">
        <div className="text-xs text-muted-foreground font-mono">v0.2.0</div>
      </div>
    </aside>
  )

  return (
    <>
      {nav}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}
    </>
  )
}
