import { NextRequest, NextResponse } from 'next/server'
import { getAllStockList } from '@/lib/twse'
import { getStockInfo } from '@/lib/finmind'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') || ''
  if (q.length < 1) return NextResponse.json({ data: [] })
  try {
    const list = await getAllStockList()
    const lower = q.toLowerCase()
    const results = list
      .filter(s => s.code.includes(q) || s.name.toLowerCase().includes(lower))
      .slice(0, 10)

    // If query looks like a stock code and not found in list, try FinMind directly
    if (/^\d{4,6}$/.test(q) && !results.some(r => r.code === q)) {
      try {
        const info = await getStockInfo(q)
        if (info && info.length > 0) {
          const item = info[0] as Record<string, string>
          const name = item['stock_name']
          if (name) {
            results.unshift({
              code: q,
              name,
              industry: item['industry_category'] || '',
            })
          }
        }
      } catch { /* FinMind unavailable, return list-only results */ }
    }

    return NextResponse.json({ data: results.slice(0, 10) })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
