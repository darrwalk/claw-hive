'use client'

import { LogEntry } from '@/lib/types'

interface Props {
  log: LogEntry[]
}

function formatDelta(ms: number): string {
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `+${secs}s`
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return s > 0 ? `+${m}m${s}s` : `+${m}m`
}

export default function ExecutionTimeline({ log }: Props) {
  if (!log || log.length === 0) return null

  const sorted = [...log].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())

  return (
    <div className="overflow-x-auto pb-2">
      <div className="relative flex items-center min-w-max px-6 py-8">
        {/* Horizontal connecting line */}
        <div
          className="absolute h-px bg-border"
          style={{
            left: '1.5rem',
            right: '1.5rem',
            top: '50%',
            transform: 'translateY(-50%)',
          }}
        />

        {sorted.map((entry, i) => {
          const prev = sorted[i - 1]
          const deltaMs = prev ? new Date(entry.ts).getTime() - new Date(prev.ts).getTime() : null

          return (
            <div key={`${entry.ts}-${i}`} className="relative flex flex-col items-center mx-6">
              {/* Elapsed delta above dot */}
              <div className="text-[10px] text-muted-foreground mb-1 h-4 whitespace-nowrap">
                {deltaMs !== null ? formatDelta(deltaMs) : ''}
              </div>

              {/* Dot */}
              <div className="w-3 h-3 rounded-full bg-primary ring-2 ring-background z-10 shrink-0" />

              {/* Event label below dot */}
              <div className="text-[11px] font-medium mt-1 whitespace-nowrap">{entry.event}</div>

              {/* Agent label */}
              {entry.agent && (
                <div className="text-[10px] text-muted-foreground whitespace-nowrap">{entry.agent}</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
