import { NextRequest, NextResponse } from 'next/server'
import { getStockPrice, getInstitutionalInvestors } from '@/lib/finmind'
import { getTWSEStockList, getTWSEDayAll } from '@/lib/twse'
import { calculateAllIndicators, checkMACrossover, checkKDCrossover } from '@/lib/indicators'
import { OHLCVData, ScanCondition, ScanConditionOperator } from '@/lib/types'

// Top Taiwan stocks by market cap for default universe
const DEFAULT_UNIVERSE = [
  '2330','2317','2454','2308','2382','2412','3711','2303','2881','2882',
  '2886','2884','2885','2891','2892','2890','1301','1303','1326','2002',
  '2207','2357','2376','2395','2408','3008','3034','3037','4938','6505',
  '2327','2344','2379','2408','5871','6669','2887','2888','2883','2801',
  '2609','2615','2603','2610','2618','1216','1101','1102','2301','2352',
]

async function evaluateCondition(
  condition: ScanCondition,
  ohlcv: OHLCVData[],
  institutionalData: { foreign_net: number; trust_net: number; total_net: number } | null
): Promise<boolean> {
  if (ohlcv.length < 2) return false
  const ind = calculateAllIndicators(ohlcv)
  const last = ohlcv[ohlcv.length - 1]
  const prev = ohlcv[ohlcv.length - 2]

  switch (condition.indicator) {
    case 'ma_bullish':
      return (ind.ma5.at(-1) ?? 0) > (ind.ma20.at(-1) ?? 0) &&
        (ind.ma20.at(-1) ?? 0) > (ind.ma60.at(-1) ?? 0)
    case 'price_above_ma20':
      return last.close > (ind.ma20.at(-1) ?? Infinity)
    case 'price_above_ma60':
      return last.close > (ind.ma60.at(-1) ?? Infinity)
    case 'ma5_golden_ma20':
      return checkMACrossover(ind.ma5, ind.ma20, 'golden')
    case 'ma5_death_ma20':
      return checkMACrossover(ind.ma5, ind.ma20, 'death')
    case 'kd_golden_low':
      return checkKDCrossover(ind.k, ind.d, 'golden')
    case 'kd_death_high':
      return checkKDCrossover(ind.k, ind.d, 'death')
    case 'k_oversold':
      return (ind.k.at(-1) ?? 100) < 20
    case 'k_overbought':
      return (ind.k.at(-1) ?? 0) > 80
    case 'macd_golden':
      return (ind.macd_dif.at(-2) ?? 0) <= (ind.macd_dea.at(-2) ?? 0) &&
        (ind.macd_dif.at(-1) ?? 0) > (ind.macd_dea.at(-1) ?? 0)
    case 'macd_hist_positive':
      return (ind.macd_hist.at(-2) ?? 0) <= 0 && (ind.macd_hist.at(-1) ?? 0) > 0
    case 'macd_above_zero':
      return (ind.macd_dif.at(-1) ?? -1) > 0
    case 'rsi_oversold':
      return (ind.rsi14.at(-1) ?? 100) < 30
    case 'rsi_overbought':
      return (ind.rsi14.at(-1) ?? 0) > 70
    case 'volume_breakout': {
      const n = condition.params?.n ?? 20
      const x = condition.params?.x ?? 2
      const recent = ohlcv.slice(-n)
      if (recent.length < n) return false
      const avgVol = recent.slice(0, -1).reduce((s, d) => s + d.volume, 0) / (n - 1)
      return last.volume > avgVol * x
    }
    case 'volume_price_up':
      return last.volume > prev.volume && last.close > prev.close
    case 'volume_shrink':
      return last.volume < (ohlcv.slice(-6, -1).reduce((s, d) => s + d.volume, 0) / 5)
    case 'foreign_buy_consecutive': {
      if (!institutionalData) return false
      return institutionalData.foreign_net > 0
    }
    case 'trust_buy_consecutive': {
      if (!institutionalData) return false
      return institutionalData.trust_net > 0
    }
    case 'institutional_all_buy': {
      if (!institutionalData) return false
      return institutionalData.total_net > 0
    }
    case 'bb_lower_bounce': {
      const lower = ind.bb_lower.at(-1)
      return lower !== null && lower !== undefined && last.close >= lower && prev.close < lower
    }
    case 'new_high_n': {
      const n = condition.params?.n ?? 20
      const highs = ohlcv.slice(-n).map(d => d.high)
      return last.close >= Math.max(...highs)
    }
    default:
      return false
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const groups: { operator: ScanConditionOperator; conditions: ScanCondition[] }[] = body.groups || []
    const universe: string[] = body.universe || DEFAULT_UNIVERSE
    const globalOperator: ScanConditionOperator = body.globalOperator || 'AND'

    if (groups.every(g => g.conditions.filter(c => c.enabled).length === 0)) {
      return NextResponse.json({ error: '請至少選擇一個條件' }, { status: 400 })
    }

    const stockList = await getTWSEStockList()
    const dayAll = await getTWSEDayAll()

    const results = []
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 180)
    const startDateStr = startDate.toISOString().split('T')[0]

    const instStartDate = new Date()
    instStartDate.setDate(instStartDate.getDate() - 5)
    const instStartDateStr = instStartDate.toISOString().split('T')[0]

    for (const code of universe.slice(0, 60)) {
      try {
        const needsInstitutional = groups.some(g =>
          g.conditions.some(c => c.enabled && ['foreign_buy_consecutive', 'trust_buy_consecutive', 'institutional_all_buy'].includes(c.indicator))
        )

        const [priceRaw, instRaw] = await Promise.allSettled([
          getStockPrice(code, startDateStr),
          needsInstitutional ? getInstitutionalInvestors(code, instStartDateStr) : Promise.resolve([]),
        ])

        if (priceRaw.status !== 'fulfilled' || !priceRaw.value?.length) continue

        const ohlcv: OHLCVData[] = priceRaw.value.map((item: Record<string, string | number>) => ({
          date: String(item.date),
          open: Number(item.open),
          high: Number(item.max),
          low: Number(item.min),
          close: Number(item.close),
          volume: Number(item.Trading_Volume),
        }))

        // Aggregate institutional: latest date
        let institutionalData = null
        if (instRaw.status === 'fulfilled' && instRaw.value?.length) {
          const sorted = [...instRaw.value].sort((a: Record<string,string>, b: Record<string,string>) => String(b.date).localeCompare(String(a.date)))
          const latestDate = String(sorted[0].date)
          const latestDay = sorted.filter((d: Record<string,string>) => String(d.date) === latestDate)
          let foreign_net = 0, trust_net = 0, dealer_net = 0
          for (const item of latestDay) {
            const name = String(item.name)
            const net = Number(item.buy) - Number(item.sell)
            if (name.includes('外資')) foreign_net = net
            else if (name.includes('投信')) trust_net = net
            else if (name.includes('自營')) dealer_net = net
          }
          institutionalData = { foreign_net, trust_net, total_net: foreign_net + trust_net + dealer_net }
        }

        // Evaluate each group
        const groupResults = await Promise.all(
          groups.map(async group => {
            const enabledConditions = group.conditions.filter(c => c.enabled)
            if (enabledConditions.length === 0) return true
            const condResults = await Promise.all(
              enabledConditions.map(c => evaluateCondition(c, ohlcv, institutionalData))
            )
            return group.operator === 'AND'
              ? condResults.every(Boolean)
              : condResults.some(Boolean)
          })
        )

        const passed = globalOperator === 'AND'
          ? groupResults.every(Boolean)
          : groupResults.some(Boolean)

        if (passed) {
          const info = stockList.find(s => s.code === code)
          const todayData = dayAll[code]
          const matched = groups.flatMap(g =>
            g.conditions.filter(c => c.enabled).map(c => c.label)
          )
          results.push({
            code,
            name: info?.name || code,
            close: todayData?.close ?? ohlcv.at(-1)?.close ?? 0,
            change_pct: todayData?.change_pct ?? 0,
            volume: todayData?.volume ?? ohlcv.at(-1)?.volume ?? 0,
            matched_conditions: matched,
          })
        }
      } catch {
        // skip failed stocks
      }
    }

    return NextResponse.json({ data: results })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
