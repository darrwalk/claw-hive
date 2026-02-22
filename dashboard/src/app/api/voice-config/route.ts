import { NextResponse } from 'next/server'
import { availableProviders } from '@/voice/config'

export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json({ providers: availableProviders() })
}
