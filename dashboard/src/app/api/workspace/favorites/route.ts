import { NextRequest, NextResponse } from 'next/server'
import { getFavorites, addFavorite, removeFavorite } from '@/lib/workspace'

export async function GET() {
  const favorites = await getFavorites()
  return NextResponse.json(favorites)
}

export async function POST(req: NextRequest) {
  const { path, label } = await req.json()
  if (!path) return NextResponse.json({ error: 'path required' }, { status: 400 })
  const favorites = await addFavorite(path, label)
  return NextResponse.json(favorites, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const { path } = await req.json()
  if (!path) return NextResponse.json({ error: 'path required' }, { status: 400 })
  const favorites = await removeFavorite(path)
  return NextResponse.json(favorites)
}
