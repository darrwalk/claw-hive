import { NextRequest, NextResponse } from 'next/server'
import { readFileContent } from '@/lib/workspace'

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'path required' }, { status: 400 })

  try {
    const result = await readFileContent(path)
    if ('buffer' in result) {
      return new NextResponse(new Uint8Array(result.buffer), {
        headers: { 'Content-Type': result.mimeType, 'Cache-Control': 'no-store' },
      })
    }
    return NextResponse.json({ content: result.content, mimeType: result.mimeType })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    if (msg === 'Path traversal denied') return NextResponse.json({ error: msg }, { status: 403 })
    return NextResponse.json({ error: msg }, { status: 404 })
  }
}
