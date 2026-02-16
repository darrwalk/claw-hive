import { getActiveTasks, getArchivedTasks, getActivityFeed } from '@/lib/tasks'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import ActivityFilter from '@/components/ActivityFilter'

export const dynamic = 'force-dynamic'

const EVENT_COLORS: Record<string, string> = {
  created: 'bg-green-950 text-green-400',
  claimed: 'bg-blue-950 text-blue-400',
  in_progress: 'bg-blue-950 text-blue-400',
  progress: 'bg-blue-950 text-blue-400',
  completed: 'bg-green-950 text-green-400',
  failed: 'bg-red-950 text-red-400',
  blocked: 'bg-orange-950 text-orange-400',
  unblocked: 'bg-yellow-950 text-yellow-400',
  update: 'bg-secondary text-muted-foreground',
  timeout: 'bg-red-950 text-red-400',
}

export default async function ActivityPage() {
  const [active, archived] = await Promise.all([getActiveTasks(), getArchivedTasks()])
  const feed = getActivityFeed([...active, ...archived])
  const eventTypes = [...new Set(feed.map(e => e.event))]

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Activity Feed</h2>
      <ActivityFilter feed={feed} eventTypes={eventTypes} eventColors={EVENT_COLORS} />
    </div>
  )
}
