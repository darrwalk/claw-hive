import { NextResponse } from 'next/server'
import { getActiveTasks, getStats } from '@/lib/tasks'

export const dynamic = 'force-dynamic'

export async function GET() {
  const tasks = await getActiveTasks()
  return NextResponse.json(getStats(tasks))
}
