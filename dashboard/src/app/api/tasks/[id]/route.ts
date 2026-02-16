import { NextRequest, NextResponse } from 'next/server'
import { getTask, updateTask } from '@/lib/tasks'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const task = await getTask(params.id)
  if (!task) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(task)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const task = await updateTask(params.id, body)
    if (!task) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json(task)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
