'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Activity, HardDrive, Container, Shield, Clock, RefreshCw } from 'lucide-react'

interface ContainerCheck {
  name: string
  status: string
  healthy: boolean
  restarts: number
}

interface HealthData {
  timestamp: string | null
  overall: 'healthy' | 'degraded' | 'critical' | 'unknown'
  checks: {
    containers?: ContainerCheck[]
    disk?: { used_pct: number; free_gb: number }
    vault_sync?: { last_sync_age_sec: number; stale: boolean }
    backup?: { last_backup: string; age_hours: number }
    oauth?: { google_token_age_days: number; expiring_soon: boolean }
    tailscale?: { connected: boolean }
  }
  alerts: string[]
  error?: string
}

const STATUS_COLORS: Record<string, string> = {
  healthy: 'bg-green-500/20 text-green-400 border-green-500/30',
  degraded: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  unknown: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
}

const STATUS_BORDER: Record<string, string> = {
  healthy: 'border-l-green-500',
  degraded: 'border-l-yellow-500',
  critical: 'border-l-red-500',
  unknown: 'border-l-zinc-500',
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function HealthPage() {
  const [data, setData] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/health-dashboard')
      setData(await res.json())
    } catch {
      setData({ overall: 'unknown', timestamp: null, checks: {}, alerts: [], error: 'Fetch failed' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHealth()
    const interval = setInterval(fetchHealth, 30_000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">System Health</h2>
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    )
  }

  if (!data) return null

  const { checks } = data

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">System Health</h2>
        <div className="flex items-center gap-3">
          {data.timestamp && (
            <span className="text-xs text-muted-foreground">Updated {timeAgo(data.timestamp)}</span>
          )}
          <button onClick={fetchHealth} className="p-1 rounded hover:bg-secondary transition-colors">
            <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Overall status banner */}
      <Card className={`border-l-4 ${STATUS_BORDER[data.overall] || STATUS_BORDER.unknown}`}>
        <CardContent className="py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="h-5 w-5" />
            <span className="font-medium">Overall Status</span>
          </div>
          <Badge variant="outline" className={STATUS_COLORS[data.overall] || STATUS_COLORS.unknown}>
            {data.overall.toUpperCase()}
          </Badge>
        </CardContent>
      </Card>

      {data.error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
          {data.error}
        </div>
      )}

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <Card className="border-l-4 border-l-red-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {data.alerts.map((alert, i) => (
              <div key={i} className="text-sm text-red-400">{alert}</div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Containers */}
        {checks.containers && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Container className="h-4 w-4" /> Containers
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {checks.containers.map((c) => (
                <div key={c.name} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-xs truncate max-w-[200px]">{c.name}</span>
                  <div className="flex items-center gap-2">
                    {c.restarts > 0 && (
                      <span className="text-xs text-yellow-400">{c.restarts} restarts</span>
                    )}
                    <Badge variant="outline" className={c.healthy ? STATUS_COLORS.healthy : STATUS_COLORS.critical}>
                      {c.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Disk */}
        {checks.disk && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <HardDrive className="h-4 w-4" /> Disk Usage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{checks.disk.used_pct}% used</span>
                  <span className="text-muted-foreground">{checks.disk.free_gb} GB free</span>
                </div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      checks.disk.used_pct > 90 ? 'bg-red-500' : checks.disk.used_pct > 80 ? 'bg-yellow-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${checks.disk.used_pct}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Vault Sync */}
        {checks.vault_sync && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4" /> Vault Sync
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between text-sm">
                <span>Last sync</span>
                <Badge variant="outline" className={checks.vault_sync.stale ? STATUS_COLORS.critical : STATUS_COLORS.healthy}>
                  {Math.floor(checks.vault_sync.last_sync_age_sec / 60)}m ago
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Backup */}
        {checks.backup && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Shield className="h-4 w-4" /> Backup
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between text-sm">
                <span>Last backup</span>
                <Badge variant="outline" className={checks.backup.age_hours > 36 ? STATUS_COLORS.critical : STATUS_COLORS.healthy}>
                  {checks.backup.age_hours.toFixed(1)}h ago
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {/* OAuth */}
        {checks.oauth && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">OAuth Tokens</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between text-sm">
                <span>Google token age</span>
                <Badge variant="outline" className={checks.oauth.expiring_soon ? STATUS_COLORS.degraded : STATUS_COLORS.healthy}>
                  {checks.oauth.google_token_age_days}d
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tailscale */}
        {checks.tailscale && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Tailscale</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between text-sm">
                <span>Connection</span>
                <Badge variant="outline" className={checks.tailscale.connected ? STATUS_COLORS.healthy : STATUS_COLORS.critical}>
                  {checks.tailscale.connected ? 'Connected' : 'Disconnected'}
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
