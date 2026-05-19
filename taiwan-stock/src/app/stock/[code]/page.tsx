'use client'

import { useState, useEffect, use } from 'react'
import { ArrowLeft, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import InstitutionalTable from '@/components/InstitutionalTable'
import FinancialCard from '@/components/FinancialCard'
import SearchBar from '@/components/SearchBar'
import { OHLCVData, TechnicalIndicators, InstitutionalData } from '@/lib/types'
import { calculateAllIndicators } from '@/lib/indicators'

const StockChart = dynamic(() => import('@/components/StockChart'), { ssr: false, loading: () => <div className="h-80 bg-gray-800 rounded-xl animate-pulse" /> })

type Tab = 'chart' | 'institutional' | 'financial'

interface FinData {
  pe_ratio: number | null
  pb_ratio: number | null
  dividend_yield: number | null
  eps: number | null
  roe: number | null
  revenue_yoy: number | null
}

export default function StockPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('chart')
  const [priceData, setPriceData] = useState<OHLCVData[]>([])
  const [indicators, setIndicators] = useState<TechnicalIndicators | null>(null)
  const [institutional, setInstitutional] = useState<InstitutionalData[]>([])
  const [financial, setFinancial] = useState<FinData | null>(null)
  const [stockInfo, setStockInfo] = useState<{ name: string; industry?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(120)

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [priceRes, infoRes] = await Promise.all([
        fetch(`/api/stock/${code}/price?days=${days}`),
        fetch(`/api/stock/${code}/info`),
      ])
      const priceJson = await priceRes.json()
      const infoJson = await infoRes.json()

      if (priceJson.data?.length) {
        setPriceData(priceJson.data)
        setIndicators(calculateAllIndicators(priceJson.data))
      }
      if (infoJson.data) setStockInfo(infoJson.data)
    } finally {
      setLoading(false)
    }
  }

  const fetchInstitutional = async () => {
    const res = await fetch(`/api/stock/${code}/institutional`)
    const json = await res.json()
    if (json.data) setInstitutional(json.data)
  }

  const fetchFinancial = async () => {
    const res = await fetch(`/api/stock/${code}/financial`)
    const json = await res.json()
    if (json.data) setFinancial(json.data)
  }

  useEffect(() => { fetchAll() }, [code, days])
  useEffect(() => {
    if (tab === 'institutional' && institutional.length === 0) fetchInstitutional()
    if (tab === 'financial' && !financial) fetchFinancial()
  }, [tab])

  const last = priceData.at(-1)
  const prev = priceData.at(-2)
  const change = last && prev ? last.close - prev.close : null
  const changePct = change && prev ? (change / prev.close) * 100 : null
  const isUp = change !== null && change >= 0

  const tabs: { key: Tab; label: string }[] = [
    { key: 'chart', label: '技術分析' },
    { key: 'institutional', label: '三大法人' },
    { key: 'financial', label: '基本面' },
  ]

  return (
    <div className="max-w-3xl mx-auto px-4 py-4">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => router.back()} className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400">
          <ArrowLeft size={20} />
        </button>
        <SearchBar placeholder="搜尋其他股票..." />
      </div>

      {/* Stock header */}
      <div className="bg-gray-800 rounded-2xl p-4 mb-4 border border-gray-700">
        {loading ? (
          <div className="space-y-2">
            <div className="h-6 bg-gray-700 rounded w-40 animate-pulse" />
            <div className="h-8 bg-gray-700 rounded w-28 animate-pulse" />
          </div>
        ) : (
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl font-bold text-white">{code}</span>
                <span className="text-gray-400">{stockInfo?.name}</span>
                {stockInfo?.industry && (
                  <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">{stockInfo.industry}</span>
                )}
              </div>
              {last && (
                <div className="flex items-center gap-3">
                  <span className={`text-3xl font-bold ${isUp ? 'text-red-400' : 'text-green-400'}`}>
                    {last.close.toFixed(2)}
                  </span>
                  {change !== null && changePct !== null && (
                    <div className={`flex items-center gap-1 text-sm font-medium ${isUp ? 'text-red-400' : 'text-green-400'}`}>
                      {isUp ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                      {isUp ? '+' : ''}{change.toFixed(2)} ({isUp ? '+' : ''}{changePct.toFixed(2)}%)
                    </div>
                  )}
                </div>
              )}
              {last && <div className="text-xs text-gray-500 mt-1">最後更新：{last.date}</div>}
            </div>
            <button onClick={fetchAll} className="p-2 text-gray-500 hover:text-white hover:bg-gray-700 rounded-lg transition-colors">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-800 p-1 rounded-xl">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === t.key ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'chart' && (
        <div className="space-y-4">
          <div className="flex gap-2 justify-end">
            {[60, 120, 240].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1 text-xs rounded-lg transition-colors ${days === d ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
              >
                {d}日
              </button>
            ))}
          </div>
          {!loading && priceData.length > 0 && indicators ? (
            <StockChart data={priceData} indicators={indicators} />
          ) : (
            <div className="space-y-2">
              <div className="h-80 bg-gray-800 rounded-xl animate-pulse" />
              <div className="h-32 bg-gray-800 rounded-xl animate-pulse" />
            </div>
          )}
        </div>
      )}

      {tab === 'institutional' && (
        <div className="bg-gray-800 rounded-2xl p-4 border border-gray-700">
          <h3 className="text-white font-semibold mb-3">三大法人買賣超（近10日）</h3>
          {institutional.length > 0 ? (
            <InstitutionalTable data={institutional} />
          ) : (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <div key={i} className="h-8 bg-gray-700 rounded animate-pulse" />)}
            </div>
          )}
        </div>
      )}

      {tab === 'financial' && (
        <div className="bg-gray-800 rounded-2xl p-4 border border-gray-700">
          <h3 className="text-white font-semibold mb-3">基本面數據</h3>
          {financial ? (
            <FinancialCard data={financial} />
          ) : (
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => <div key={i} className="h-10 bg-gray-700 rounded animate-pulse" />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
