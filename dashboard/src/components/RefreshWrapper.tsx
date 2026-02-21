'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function RefreshWrapper({ children }: { children: React.ReactNode }) {
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
    <>
      <div className="refresh-bar">
        Updated {lastRefresh?.toLocaleTimeString()}
      </div>
      {children}
    </>
  )
}
