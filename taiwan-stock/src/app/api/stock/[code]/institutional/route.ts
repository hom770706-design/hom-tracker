import { NextRequest, NextResponse } from 'next/server'
import { getInstitutionalInvestors } from '@/lib/finmind'
import { InstitutionalData } from '@/lib/types'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - 60)
  const startDateStr = startDate.toISOString().split('T')[0]

  try {
    const raw = await getInstitutionalInvestors(code, startDateStr)
    const grouped: Record<string, Partial<InstitutionalData>> = {}

    for (const item of raw) {
      const date = String(item.date)
      if (!grouped[date]) grouped[date] = { date, foreign_buy: 0, foreign_sell: 0, foreign_net: 0, trust_buy: 0, trust_sell: 0, trust_net: 0, dealer_buy: 0, dealer_sell: 0, dealer_net: 0, total_net: 0 }
      const name = String(item.name)
      const buy = Number(item.buy)
      const sell = Number(item.sell)
      if (name.includes('外資') || name.includes('Foreign')) {
        grouped[date].foreign_buy = buy
        grouped[date].foreign_sell = sell
        grouped[date].foreign_net = buy - sell
      } else if (name.includes('投信') || name.includes('Investment')) {
        grouped[date].trust_buy = buy
        grouped[date].trust_sell = sell
        grouped[date].trust_net = buy - sell
      } else if (name.includes('自營') || name.includes('Dealer')) {
        grouped[date].dealer_buy = buy
        grouped[date].dealer_sell = sell
        grouped[date].dealer_net = buy - sell
      }
    }

    const data: InstitutionalData[] = Object.values(grouped)
      .map(d => {
        const fn = d.foreign_net ?? 0
        const tn = d.trust_net ?? 0
        const dn = d.dealer_net ?? 0
        return { ...d, total_net: fn + tn + dn } as InstitutionalData
      })
      .sort((a, b) => b.date.localeCompare(a.date))

    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
