import { NextRequest, NextResponse } from 'next/server'
import { listDirectory } from '@/lib/workspace'

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'path required' }, { status: 400 })

  try {
    const entries = await listDirectory(path)
    return NextResponse.json(entries)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    if (msg === 'Path traversal denied') return NextResponse.json({ error: msg }, { status: 403 })
    return NextResponse.json({ error: msg }, { status: 404 })
  }
}
