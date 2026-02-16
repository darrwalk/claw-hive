import type { Metadata } from 'next'
import './globals.css'
import LayoutShell from '@/components/LayoutShell'

export const metadata: Metadata = {
  title: 'claw-hive',
  description: 'Task dashboard for OpenClaw agents',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen">
        <LayoutShell>{children}</LayoutShell>
      </body>
    </html>
  )
}
