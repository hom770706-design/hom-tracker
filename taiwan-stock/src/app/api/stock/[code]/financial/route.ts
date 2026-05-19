import { NextRequest, NextResponse } from 'next/server'
import { getFinancialStatement, getStockPER, getMonthRevenue } from '@/lib/finmind'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - 90)
  const startDateStr = startDate.toISOString().split('T')[0]

  try {
    const [perData, revenueData] = await Promise.allSettled([
      getStockPER(code, startDateStr),
      getMonthRevenue(code),
    ])

    const latestPer = perData.status === 'fulfilled' && perData.value?.length
      ? perData.value[perData.value.length - 1]
      : null

    // Get revenue YoY from last 13 months
    let revenueYoY: number | null = null
    if (revenueData.status === 'fulfilled' && revenueData.value?.length >= 13) {
      const rev = revenueData.value.sort((a: Record<string,string>, b: Record<string,string>) =>
        `${b.date}`.localeCompare(`${a.date}`)
      )
      const curr = Number(rev[0]?.revenue ?? 0)
      const prev = Number(rev[12]?.revenue ?? 0)
      if (prev > 0) revenueYoY = ((curr - prev) / prev) * 100
    }

    // Fetch financial statement for EPS, ROE
    const stmtData = await getFinancialStatement(code).catch(() => [])
    const latestEps = stmtData.filter((d: Record<string,string>) => d.type === 'EPS').slice(-1)[0]
    const latestRoe = stmtData.filter((d: Record<string,string>) => d.type === 'ROE').slice(-1)[0]

    return NextResponse.json({
      data: {
        pe_ratio: latestPer ? Number(latestPer.PER) : null,
        pb_ratio: latestPer ? Number(latestPer.PBR) : null,
        dividend_yield: latestPer ? Number(latestPer.DividendYield) : null,
        eps: latestEps ? Number(latestEps.value) : null,
        roe: latestRoe ? Number(latestRoe.value) : null,
        revenue_yoy: revenueYoY,
      }
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
