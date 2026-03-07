import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'

const DATA_PATH = process.env.HIVE_DATA_PATH || '/app/data/hive'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id.replace(/^task-/, '')
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return NextResponse.json({ error: 'invalid task id' }, { status: 400 })
  }
  const filename = `task-${id}.output.md`

  for (const subdir of ['active', 'archive']) {
    try {
      const content = await readFile(join(DATA_PATH, subdir, filename), 'utf-8')
      return NextResponse.json({ content })
    } catch { /* not found in this dir */ }
  }

  return NextResponse.json({ error: 'no output found' }, { status: 404 })
}
