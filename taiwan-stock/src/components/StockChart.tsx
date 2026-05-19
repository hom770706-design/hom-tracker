'use client'

import { useEffect, useRef, useState } from 'react'
import { createChart, ColorType, CandlestickSeries, LineSeries, HistogramSeries, IChartApi } from 'lightweight-charts'
import { OHLCVData, TechnicalIndicators } from '@/lib/types'

type ActiveIndicator = 'MA' | 'BB' | 'KD' | 'MACD' | 'RSI' | 'Volume'

interface Props {
  data: OHLCVData[]
  indicators: TechnicalIndicators
}

const CHART_BG = '#111827'
const GRID = '#1f2937'
const TEXT = '#9ca3af'

function toChartTime(date: string) {
  return date as `${number}-${number}-${number}`
}

export default function StockChart({ data, indicators }: Props) {
  const priceRef = useRef<HTMLDivElement>(null)
  const subRef = useRef<HTMLDivElement>(null)
  const chartsRef = useRef<IChartApi[]>([])
  const [active, setActive] = useState<ActiveIndicator[]>(['MA', 'Volume', 'KD'])

  const toggle = (ind: ActiveIndicator) => {
    setActive(prev => prev.includes(ind) ? prev.filter(i => i !== ind) : [...prev, ind])
  }

  useEffect(() => {
    chartsRef.current.forEach(c => c.remove())
    chartsRef.current = []
    if (!priceRef.current || !subRef.current || data.length === 0) return

    const chartOpts = {
      layout: { background: { type: ColorType.Solid, color: CHART_BG }, textColor: TEXT },
      grid: { vertLines: { color: GRID }, horzLines: { color: GRID } },
      rightPriceScale: { borderColor: GRID },
      timeScale: { borderColor: GRID, timeVisible: true },
    }

    // --- Price chart ---
    const priceChart = createChart(priceRef.current, {
      ...chartOpts,
      width: priceRef.current.clientWidth,
      height: 340,
    })
    chartsRef.current.push(priceChart)

    const candleSeries = priceChart.addSeries(CandlestickSeries, {
      upColor: '#ef4444', downColor: '#22c55e',
      borderUpColor: '#ef4444', borderDownColor: '#22c55e',
      wickUpColor: '#ef4444', wickDownColor: '#22c55e',
    })
    candleSeries.setData(data.map(d => ({ time: toChartTime(d.date), open: d.open, high: d.high, low: d.low, close: d.close })))

    if (active.includes('MA')) {
      const maColors = ['#3b82f6', '#f59e0b', '#a855f7', '#ec4899']
      const maLabels = ['MA5', 'MA20', 'MA60', 'MA120']
      const maSeries = [indicators.ma5, indicators.ma20, indicators.ma60, indicators.ma120]
      maSeries.forEach((ma, i) => {
        const s = priceChart.addSeries(LineSeries, { color: maColors[i], lineWidth: 1, title: maLabels[i] })
        s.setData(data.map((d, idx) => ({ time: toChartTime(d.date), value: ma[idx] })).filter(p => p.value !== null) as {time: `${number}-${number}-${number}`, value: number}[])
      })
    }

    if (active.includes('BB')) {
      const bbColor = '#64748b'
      const upper = priceChart.addSeries(LineSeries, { color: bbColor, lineWidth: 1, lineStyle: 2, title: 'BB上' })
      const lower = priceChart.addSeries(LineSeries, { color: bbColor, lineWidth: 1, lineStyle: 2, title: 'BB下' })
      upper.setData(data.map((d, i) => ({ time: toChartTime(d.date), value: indicators.bb_upper[i] })).filter(p => p.value !== null) as {time:`${number}-${number}-${number}`, value:number}[])
      lower.setData(data.map((d, i) => ({ time: toChartTime(d.date), value: indicators.bb_lower[i] })).filter(p => p.value !== null) as {time:`${number}-${number}-${number}`, value:number}[])
    }

    priceChart.timeScale().fitContent()

    // --- Sub chart ---
    subRef.current.innerHTML = ''
    const subIndicators = (['Volume', 'KD', 'MACD', 'RSI'] as ActiveIndicator[]).filter(i => active.includes(i))

    subIndicators.forEach(ind => {
      const wrapper = document.createElement('div')
      wrapper.style.height = '140px'
      wrapper.style.marginTop = '4px'
      subRef.current!.appendChild(wrapper)

      const subChart = createChart(wrapper, {
        ...chartOpts,
        width: subRef.current!.clientWidth,
        height: 140,
      })
      chartsRef.current.push(subChart)

      if (ind === 'Volume') {
        const vs = subChart.addSeries(HistogramSeries, { title: '成交量' })
        vs.setData(data.map(d => ({
          time: toChartTime(d.date),
          value: d.volume,
          color: d.close >= d.open ? '#ef4444' : '#22c55e',
        })))
      } else if (ind === 'KD') {
        const ks = subChart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 1, title: 'K' })
        const ds = subChart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 1, title: 'D' })
        ks.setData(data.map((d, i) => ({ time: toChartTime(d.date), value: indicators.k[i] })).filter(p => p.value !== null) as {time:`${number}-${number}-${number}`, value:number}[])
        ds.setData(data.map((d, i) => ({ time: toChartTime(d.date), value: indicators.d[i] })).filter(p => p.value !== null) as {time:`${number}-${number}-${number}`, value:number}[])
        subChart.priceScale('right').applyOptions({ autoScale: false, minimumWidth: 48 })
        ks.applyOptions({ autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 }, margins: { above: 0, below: 0 } }) })
      } else if (ind === 'MACD') {
        const difS = subChart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 1, title: 'DIF' })
        const deaS = subChart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 1, title: 'DEA' })
        const histS = subChart.addSeries(HistogramSeries, { title: 'MACD' })
        difS.setData(data.map((d, i) => ({ time: toChartTime(d.date), value: indicators.macd_dif[i] })).filter(p => p.value !== null) as {time:`${number}-${number}-${number}`, value:number}[])
        deaS.setData(data.map((d, i) => ({ time: toChartTime(d.date), value: indicators.macd_dea[i] })).filter(p => p.value !== null) as {time:`${number}-${number}-${number}`, value:number}[])
        histS.setData(data.map((d, i) => ({ time: toChartTime(d.date), value: indicators.macd_hist[i], color: (indicators.macd_hist[i] ?? 0) >= 0 ? '#ef4444' : '#22c55e' })).filter(p => p.value !== null) as {time:`${number}-${number}-${number}`, value:number, color:string}[])
      } else if (ind === 'RSI') {
        const rsiS = subChart.addSeries(LineSeries, { color: '#a855f7', lineWidth: 1, title: 'RSI14' })
        rsiS.setData(data.map((d, i) => ({ time: toChartTime(d.date), value: indicators.rsi14[i] })).filter(p => p.value !== null) as {time:`${number}-${number}-${number}`, value:number}[])
        rsiS.applyOptions({ autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 }, margins: { above: 0, below: 0 } }) })
      }

      subChart.timeScale().fitContent()
      subChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (range) chartsRef.current.filter(c => c !== subChart).forEach(c => c.timeScale().setVisibleLogicalRange(range))
      })
    })

    // Sync scroll
    priceChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (range) chartsRef.current.filter(c => c !== priceChart).forEach(c => c.timeScale().setVisibleLogicalRange(range))
    })

    const handleResize = () => {
      chartsRef.current.forEach((c, i) => {
        const el = i === 0 ? priceRef.current : subRef.current?.children[i - 1] as HTMLElement
        if (el) c.applyOptions({ width: el.clientWidth })
      })
    }
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      chartsRef.current.forEach(c => c.remove())
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
              active.includes(b.key)
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>
      <div ref={priceRef} className="w-full rounded-lg overflow-hidden" />
      <div ref={subRef} className="w-full mt-1" />
    </div>
  )
}
