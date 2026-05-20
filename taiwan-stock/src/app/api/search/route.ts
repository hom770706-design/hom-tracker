import { NextRequest, NextResponse } from 'next/server'
import { getAllStockList } from '@/lib/twse'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') || ''
  if (q.length < 1) return NextResponse.json({ data: [] })
  try {
    const list = await getAllStockList()
    const lower = q.toLowerCase()
    const results = list
      .filter(s => s.code.includes(q) || s.name.toLowerCase().includes(lower))
      .slice(0, 10)
    return NextResponse.json({ data: results })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
