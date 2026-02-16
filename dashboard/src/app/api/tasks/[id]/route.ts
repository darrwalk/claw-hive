import { NextRequest, NextResponse } from 'next/server'
import { getTask, updateTask } from '@/lib/tasks'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const task = await getTask(params.id)
  if (!task) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(task)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const task = await updateTask(params.id, body)
  if (!task) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(task)
}
