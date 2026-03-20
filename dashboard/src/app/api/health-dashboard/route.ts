import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'

const HEALTH_FILE = '/app/data/health-status.json'
const FALLBACK_FILE = process.env.HEALTH_STATUS_PATH || HEALTH_FILE

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const raw = await readFile(FALLBACK_FILE, 'utf-8')
    const data = JSON.parse(raw)
    return NextResponse.json(data)
  } catch {
    return NextResponse.json(
      { overall: 'unknown', timestamp: null, checks: {}, alerts: [], error: 'Health data unavailable' },
      { status: 503 },
    )
  }
}
