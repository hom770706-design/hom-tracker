import { NextRequest, NextResponse } from 'next/server'
import { getStockPrice } from '@/lib/finmind'
import { getRealtimeQuote } from '@/lib/twse-realtime'
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
    const [raw, rt] = await Promise.all([
      getStockPrice(code, startDateStr),
      getRealtimeQuote(code),
    ])

    const data: OHLCVData[] = raw.map((item: Record<string, string | number>) => ({
      date: String(item.date),
      open: Number(item.open),
      high: Number(item.max),
      low: Number(item.min),
      close: Number(item.close),
      volume: Number(item.Trading_Volume),
    }))

    if (rt && data.length > 0) {
      const lastDate = data[data.length - 1].date
      if (rt.date === lastDate) {
        // FinMind already has today — update close (and intraday OHLC if available)
        const last = data[data.length - 1]
        data[data.length - 1] = {
          ...last,
          close: rt.close,
          ...(rt.open != null ? { open: rt.open } : {}),
          ...(rt.high != null ? { high: rt.high } : {}),
          ...(rt.low != null ? { low: rt.low } : {}),
        }
      } else if (rt.date > lastDate && rt.isLive) {
        // Market is actively trading today — add today as a new candle
        data.push({
          date: rt.date,
          open: rt.open ?? rt.close,
          high: rt.high ?? rt.close,
          low: rt.low ?? rt.close,
          close: rt.close,
          volume: 0,
        })
      }
    }

    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
