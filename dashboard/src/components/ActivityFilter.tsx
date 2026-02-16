'use client'

import { useState, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import Link from 'next/link'

interface FeedEntry {
  ts: string
  event: string
  agent: string
  detail: string
  task_id: string
  task_title: string
}

interface Props {
  feed: FeedEntry[]
  eventTypes: string[]
  eventColors: Record<string, string>
}

export default function ActivityFilter({ feed, eventTypes, eventColors }: Props) {
  const [filter, setFilter] = useState('all')

  const filtered = useMemo(() => {
    if (filter === 'all') return feed
    return feed.filter(e => e.event === filter)
  }, [feed, filter])

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Event type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Events</SelectItem>
            {eventTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground self-center">{filtered.length} entries</span>
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">No activity</div>
        ) : (
          filtered.slice(0, 100).map((entry, i) => (
            <div key={`${entry.task_id}-${entry.ts}-${i}`} className="flex items-start gap-3 rounded-md border bg-card p-3">
              <div className="text-xs text-muted-foreground whitespace-nowrap font-mono mt-0.5 w-[140px] shrink-0">
                {new Date(entry.ts).toLocaleString()}
              </div>
              <Badge className={`text-[10px] shrink-0 ${eventColors[entry.event] || 'bg-secondary text-muted-foreground'}`}>
                {entry.event}
              </Badge>
              <div className="flex-1 min-w-0">
                <Link href={`/tasks/${entry.task_id}`} className="text-sm font-medium hover:text-primary transition-colors">
                  {entry.task_title}
                </Link>
                {entry.agent && (
                  <span className="text-xs text-muted-foreground font-mono ml-2">[{entry.agent}]</span>
                )}
                <div className="text-xs text-muted-foreground mt-0.5 truncate">{entry.detail}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
