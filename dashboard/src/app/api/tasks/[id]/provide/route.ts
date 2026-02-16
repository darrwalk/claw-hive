import { NextRequest, NextResponse } from 'next/server'
import { provideInput } from '@/lib/tasks'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  if (!body.input) {
    return NextResponse.json({ error: 'input required' }, { status: 400 })
  }
  const task = await provideInput(params.id, body.input)
  if (!task) return NextResponse.json({ error: 'not found or not blocked' }, { status: 404 })
  return NextResponse.json(task)
}
