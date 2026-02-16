import { NextRequest, NextResponse } from 'next/server'
import { getProject, updateProject } from '@/lib/tasks'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const project = await getProject(params.id)
  if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(project)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const project = await updateProject(params.id, body)
  if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(project)
}
