'use client'

import { useState } from 'react'
import Sidebar from '@/components/Sidebar'
import AppShell from '@/components/AppShell'

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="pl-0 md:pl-56">
        <AppShell onMenuToggle={() => setSidebarOpen(v => !v)}>
          {children}
        </AppShell>
      </div>
    </>
  )
}
