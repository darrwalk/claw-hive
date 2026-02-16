'use client'

import { useState } from 'react'
import Header from '@/components/Header'
import CreateTaskDialog from '@/components/CreateTaskDialog'

interface AppShellProps {
  children: React.ReactNode
  onMenuToggle?: () => void
}

export default function AppShell({ children, onMenuToggle }: AppShellProps) {
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <>
      <Header onNewTask={() => setCreateOpen(true)} onMenuToggle={onMenuToggle} />
      <main className="p-4 md:p-6">{children}</main>
      <CreateTaskDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  )
}
