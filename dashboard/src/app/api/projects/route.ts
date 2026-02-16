import { NextRequest, NextResponse } from 'next/server'
import { getProjects, createProject } from '@/lib/tasks'

export async function GET() {
  const projects = await getProjects()
  return NextResponse.json(projects)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  if (!body.title) {
    return NextResponse.json({ error: 'title required' }, { status: 400 })
  }
  const project = await createProject(body)
  return NextResponse.json(project, { status: 201 })
}
