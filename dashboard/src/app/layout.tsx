import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'claw-hive',
  description: 'Task dashboard for OpenClaw agents',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav>
          <div className="nav-inner">
            <a href="/" className="logo">claw-hive</a>
            <div className="nav-links">
              <a href="/">Overview</a>
              <a href="/tasks">Tasks</a>
            </div>
          </div>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  )
}
