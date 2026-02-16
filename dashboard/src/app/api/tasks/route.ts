import { NextRequest, NextResponse } from 'next/server'
import { getActiveTasks, createTask } from '@/lib/tasks'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  let tasks = await getActiveTasks()

  const status = searchParams.get('status')
  const owner = searchParams.get('owner')
  if (status) tasks = tasks.filter(t => t.status === status)
  if (owner) tasks = tasks.filter(t => t.owner === owner)

  return NextResponse.json(tasks)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  if (!body.title || !body.description) {
    return NextResponse.json({ error: 'title and description required' }, { status: 400 })
  }
  const task = await createTask(body)
  return NextResponse.json(task, { status: 201 })
}
