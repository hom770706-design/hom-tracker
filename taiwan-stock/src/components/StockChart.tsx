'use client'

import { useEffect, useRef, useState } from 'react'
import {
  createChart, ColorType,
  CandlestickSeries, LineSeries, HistogramSeries,
  LineStyle, IChartApi,
} from 'lightweight-charts'
import { OHLCVData, TechnicalIndicators } from '@/lib/types'

type ActiveIndicator = 'MA' | 'BB' | 'KD' | 'MACD' | 'RSI' | 'Volume'

interface Props {
  data: OHLCVData[]
  indicators: TechnicalIndicators
}

const CHART_BG = '#111827'
const GRID = '#1f2937'
const TEXT = '#9ca3af'

function toTime(date: string) {
  return date as `${number}-${number}-${number}`
}

// Type-safe null filter
function nonNull<T>(arr: (T | null | undefined)[], dates: string[]): { time: `${number}-${number}-${number}`; value: T }[] {
  return arr
    .map((v, i) => ({ time: toTime(dates[i]), value: v }))
    .filter((p): p is { time: `${number}-${number}-${number}`; value: T } => p.value != null)
}

export default function StockChart({ data, indicators }: Props) {
  const priceRef = useRef<HTMLDivElement>(null)
  const subRef = useRef<HTMLDivElement>(null)
  const chartsRef = useRef<IChartApi[]>([])
  const [active, setActive] = useState<ActiveIndicator[]>(['MA', 'Volume', 'KD'])
  const [error, setError] = useState<string | null>(null)

  const toggle = (ind: ActiveIndicator) =>
    setActive(prev => prev.includes(ind) ? prev.filter(i => i !== ind) : [...prev, ind])

  useEffect(() => {
    if (!priceRef.current || !subRef.current || data.length === 0) return

    setError(null)

    try {
      const dates = data.map(d => d.date)

      const chartOpts = {
        layout: { background: { type: ColorType.Solid, color: CHART_BG }, textColor: TEXT },
        grid: { vertLines: { color: GRID }, horzLines: { color: GRID } },
        rightPriceScale: { borderColor: GRID },
        timeScale: { borderColor: GRID, timeVisible: false },
        crosshair: { horzLine: { visible: true }, vertLine: { visible: true } },
      }

      // --- Price chart ---
      const priceChart = createChart(priceRef.current, {
        ...chartOpts,
        width: priceRef.current.clientWidth,
        height: 320,
      })
      chartsRef.current.push(priceChart)

      const candles = priceChart.addSeries(CandlestickSeries, {
        upColor: '#ef4444', downColor: '#22c55e',
        borderUpColor: '#ef4444', borderDownColor: '#22c55e',
        wickUpColor: '#ef4444', wickDownColor: '#22c55e',
      })
      candles.setData(data.map(d => ({
        time: toTime(d.date), open: d.open, high: d.high, low: d.low, close: d.close,
      })))

      if (active.includes('MA')) {
        const maConfigs = [
          { data: indicators.ma5, color: '#3b82f6', title: 'MA5' },
          { data: indicators.ma20, color: '#f59e0b', title: 'MA20' },
          { data: indicators.ma60, color: '#a855f7', title: 'MA60' },
          { data: indicators.ma120, color: '#ec4899', title: 'MA120' },
        ]
        for (const cfg of maConfigs) {
          const s = priceChart.addSeries(LineSeries, { color: cfg.color, lineWidth: 1, title: cfg.title })
          s.setData(nonNull(cfg.data, dates))
        }
      }

      if (active.includes('BB')) {
        const bbUpper = priceChart.addSeries(LineSeries, {
          color: '#64748b', lineWidth: 1, lineStyle: LineStyle.Dashed, title: 'BB上',
        })
        const bbLower = priceChart.addSeries(LineSeries, {
          color: '#64748b', lineWidth: 1, lineStyle: LineStyle.Dashed, title: 'BB下',
        })
        bbUpper.setData(nonNull(indicators.bb_upper, dates))
        bbLower.setData(nonNull(indicators.bb_lower, dates))
      }

      priceChart.timeScale().fitContent()

      // --- Sub charts ---
      subRef.current.innerHTML = ''
      const subList = (['Volume', 'KD', 'MACD', 'RSI'] as ActiveIndicator[]).filter(i => active.includes(i))

      for (const ind of subList) {
        const wrapper = document.createElement('div')
        wrapper.style.marginTop = '2px'
        subRef.current.appendChild(wrapper)

        const subChart = createChart(wrapper, {
          ...chartOpts,
          width: subRef.current.clientWidth,
          height: 130,
        })
        chartsRef.current.push(subChart)

        if (ind === 'Volume') {
          const vs = subChart.addSeries(HistogramSeries, {})
          vs.setData(data.map(d => ({
            time: toTime(d.date),
            value: d.volume,
            color: d.close >= d.open ? '#dc2626' : '#16a34a',
          })))
          subChart.priceScale('right').applyOptions({ minimumWidth: 60 })

        } else if (ind === 'KD') {
          const ks = subChart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 1, title: 'K' })
          const ds = subChart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 1, title: 'D' })
          ks.setData(nonNull(indicators.k, dates))
          ds.setData(nonNull(indicators.d, dates))
          subChart.priceScale('right').applyOptions({ autoScale: false })
          ks.applyOptions({
            autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 }, margins: { above: 0.1, below: 0.1 } }),
          })

        } else if (ind === 'MACD') {
          const difS = subChart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 1, title: 'DIF' })
          const deaS = subChart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 1, title: 'DEA' })
          const histS = subChart.addSeries(HistogramSeries, {})
          difS.setData(nonNull(indicators.macd_dif, dates))
          deaS.setData(nonNull(indicators.macd_dea, dates))
          histS.setData(
            indicators.macd_hist
              .map((v, i) => ({ time: toTime(dates[i]), value: v, color: (v ?? 0) >= 0 ? '#dc2626' : '#16a34a' }))
              .filter((p): p is { time: `${number}-${number}-${number}`; value: number; color: string } => p.value != null)
          )

        } else if (ind === 'RSI') {
          const rsiS = subChart.addSeries(LineSeries, { color: '#a855f7', lineWidth: 1, title: 'RSI' })
          rsiS.setData(nonNull(indicators.rsi14, dates))
          subChart.priceScale('right').applyOptions({ autoScale: false })
          rsiS.applyOptions({
            autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 }, margins: { above: 0.1, below: 0.1 } }),
          })
        }

        subChart.timeScale().fitContent()
      }

      // Sync all chart scrolling
      const syncRange = (source: IChartApi) => {
        source.timeScale().subscribeVisibleLogicalRangeChange(range => {
          if (!range) return
          for (const c of chartsRef.current) {
            if (c !== source) c.timeScale().setVisibleLogicalRange(range)
          }
        })
      }
      chartsRef.current.forEach(syncRange)

      const handleResize = () => {
        if (!priceRef.current || !subRef.current) return
        const w = priceRef.current.clientWidth
        chartsRef.current[0]?.applyOptions({ width: w })
        const subs = subRef.current.children
        chartsRef.current.slice(1).forEach((c, i) => {
          if (subs[i]) c.applyOptions({ width: (subs[i] as HTMLElement).clientWidth })
        })
      }
      window.addEventListener('resize', handleResize)

      return () => {
        window.removeEventListener('resize', handleResize)
        chartsRef.current.forEach(c => { try { c.remove() } catch {} })
        chartsRef.current = []
      }
    } catch (e) {
      setError(String(e))
      console.error('Chart error:', e)
    }
  }, [data, indicators, active])

  const btns: { key: ActiveIndicator; label: string }[] = [
    { key: 'MA', label: '均線' }, { key: 'BB', label: '布林' },
    { key: 'Volume', label: '成交量' }, { key: 'KD', label: 'KD' },
    { key: 'MACD', label: 'MACD' }, { key: 'RSI', label: 'RSI' },
  ]

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {btns.map(b => (
          <button
            key={b.key}
            onClick={() => toggle(b.key)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              active.includes(b.key) ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>
      {error && <div className="text-red-400 text-xs mb-2 p-2 bg-red-900/20 rounded">{error}</div>}
      <div ref={priceRef} className="w-full rounded-lg overflow-hidden" />
      <div ref={subRef} className="w-full" />
    </div>
  )
}
