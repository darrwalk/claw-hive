import { NextResponse } from 'next/server'
import { getActiveTasks, getArchivedTasks, getActivityFeed } from '@/lib/tasks'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [active, archived] = await Promise.all([getActiveTasks(), getArchivedTasks()])
  const feed = getActivityFeed([...active, ...archived])
  return NextResponse.json(feed)
}
