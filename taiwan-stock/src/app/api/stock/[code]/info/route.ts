import { NextRequest, NextResponse } from 'next/server'
import { getTWSEStockList } from '@/lib/twse'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  try {
    const list = await getTWSEStockList()
    const found = list.find(s => s.code === code)
    if (!found) return NextResponse.json({ error: '找不到股票' }, { status: 404 })
    return NextResponse.json({ data: found })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
