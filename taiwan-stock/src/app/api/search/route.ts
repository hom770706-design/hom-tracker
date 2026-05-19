import { NextRequest, NextResponse } from 'next/server'
import { searchTWSEStock } from '@/lib/twse'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') || ''
  if (q.length < 1) return NextResponse.json({ data: [] })
  try {
    const results = await searchTWSEStock(q)
    return NextResponse.json({ data: results })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
