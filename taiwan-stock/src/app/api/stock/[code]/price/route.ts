import { NextRequest, NextResponse } from 'next/server'
import { getStockPrice } from '@/lib/finmind'
import { OHLCVData } from '@/lib/types'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  const days = parseInt(req.nextUrl.searchParams.get('days') || '180')
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)
  const startDateStr = startDate.toISOString().split('T')[0]

  try {
    const raw = await getStockPrice(code, startDateStr)
    const data: OHLCVData[] = raw.map((item: Record<string, string | number>) => ({
      date: String(item.date),
      open: Number(item.open),
      high: Number(item.max),
      low: Number(item.min),
      close: Number(item.close),
      volume: Number(item.Trading_Volume),
    }))
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
