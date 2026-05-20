import { NextRequest, NextResponse } from 'next/server'
import { getAllStockList } from '@/lib/twse'
import { getStockInfo } from '@/lib/finmind'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  try {
    const list = await getAllStockList()
    const found = list.find(s => s.code === code)
    if (found) return NextResponse.json({ data: found })

    // Fallback: FinMind TaiwanStockInfo (covers OTC/ETF not in open APIs)
    try {
      const info = await getStockInfo(code)
      if (info && info.length > 0) {
        const item = info[0] as Record<string, string>
        return NextResponse.json({
          data: {
            code,
            name: item['stock_name'] || code,
            industry: item['industry_category'] || '',
          }
        })
      }
    } catch { /* ignore fallback failure */ }

    return NextResponse.json({ error: '找不到股票' }, { status: 404 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
