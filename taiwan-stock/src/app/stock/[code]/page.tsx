'use client'

import { useState, useEffect, use } from 'react'
import { ArrowLeft, TrendingUp, TrendingDown, RefreshCw, Sparkles, Star, Briefcase, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import InstitutionalTable from '@/components/InstitutionalTable'
import FinancialCard from '@/components/FinancialCard'
import SearchBar from '@/components/SearchBar'
import { OHLCVData, TechnicalIndicators, InstitutionalData } from '@/lib/types'
import { calculateAllIndicators } from '@/lib/indicators'
import { useGrokKey } from '@/components/SettingsModal'
import { useWatchlist, usePortfolio } from '@/lib/storage'

const StockChart = dynamic(() => import('@/components/StockChart'), {
  ssr: false,
  loading: () => <div className="h-80 bg-gray-800 rounded-xl animate-pulse" />,
})

type Tab = 'chart' | 'institutional' | 'financial' | 'ai'

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
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const { key: grokKey } = useGrokKey()
  const { toggle: toggleWatch, has: inWatchlist } = useWatchlist()
  const { add: addToPortfolio } = usePortfolio()

  const [portfolioOpen, setPortfolioOpen] = useState(false)
  const [pDate, setPDate] = useState('')
  const [pPrice, setPPrice] = useState('')
  const [pShares, setPShares] = useState('1')

  const openPortfolio = () => {
    setPDate(new Date().toISOString().slice(0, 10))
    setPPrice(last?.close.toFixed(2) ?? '')
    setPortfolioOpen(true)
  }

  const savePortfolio = () => {
    const price = parseFloat(pPrice)
    const shares = parseFloat(pShares)
    if (!price || !shares || price <= 0 || shares <= 0 || !pDate) return
    addToPortfolio({ code, name: stockInfo?.name ?? code, buyDate: pDate, buyPrice: price, shares })
    setPortfolioOpen(false)
    setPShares('1')
  }

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

  const runAiAnalysis = async () => {
    // Read directly from localStorage to avoid stale closure state
    const currentKey = localStorage.getItem('groq_api_key') || grokKey
    if (!currentKey) {
      setAiError('NO_KEY')
      return
    }
    if (!indicators || priceData.length === 0) {
      setAiError('資料尚未載入，請稍後再試')
      return
    }
    setAiLoading(true)
    setAiError(null)
    setAiAnalysis(null)

    const last = priceData.at(-1)!
    const prev = priceData.at(-2)
    const changePct = prev ? ((last.close - prev.close) / prev.close) * 100 : 0
    const ind = indicators
    const latestInst = institutional[0] ?? null

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (currentKey) headers['x-grok-key'] = currentKey

      const res = await fetch(`/api/stock/${code}/analysis`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          stockName: stockInfo?.name ?? code,
          price: last.close,
          changePct,
          indicators: {
            ma5: ind.ma5.at(-1) ?? null,
            ma20: ind.ma20.at(-1) ?? null,
            ma60: ind.ma60.at(-1) ?? null,
            k: ind.k.at(-1) ?? null,
            d: ind.d.at(-1) ?? null,
            macd_dif: ind.macd_dif.at(-1) ?? null,
            macd_dea: ind.macd_dea.at(-1) ?? null,
            macd_hist: ind.macd_hist.at(-1) ?? null,
          },
          institutional: latestInst
            ? { foreign_net: latestInst.foreign_net, trust_net: latestInst.trust_net, total_net: latestInst.total_net }
            : null,
        }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setAiAnalysis(json.analysis)
    } catch (e) {
      setAiError(String(e))
    } finally {
      setAiLoading(false)
    }
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
    { key: 'ai', label: 'AI 分析' },
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
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => toggleWatch({ code, name: stockInfo?.name ?? code })}
                className={`p-2 rounded-lg transition-colors ${inWatchlist(code) ? 'text-yellow-400 hover:bg-gray-700' : 'text-gray-500 hover:text-yellow-400 hover:bg-gray-700'}`}
                title={inWatchlist(code) ? '從自選股移除' : '加入自選股'}
              >
                <Star size={16} className={inWatchlist(code) ? 'fill-yellow-400' : ''} />
              </button>
              <button
                onClick={openPortfolio}
                className="p-2 text-gray-500 hover:text-blue-400 hover:bg-gray-700 rounded-lg transition-colors"
                title="加入庫藏股"
              >
                <Briefcase size={16} />
              </button>
              <button onClick={fetchAll} className="p-2 text-gray-500 hover:text-white hover:bg-gray-700 rounded-lg transition-colors">
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-800 p-1 rounded-xl overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap px-2 ${
              tab === t.key ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Chart tab */}
      {tab === 'chart' && (
        <div className="space-y-4">
          <div className="flex gap-2 justify-end">
            {[60, 120, 240].map(d => (
              <button key={d} onClick={() => setDays(d)}
                className={`px-3 py-1 text-xs rounded-lg transition-colors ${days === d ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
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

      {/* Institutional tab */}
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

      {/* Financial tab */}
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

      {/* AI Analysis tab */}
      {tab === 'ai' && (
        <div className="bg-gray-800 rounded-2xl p-4 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold flex items-center gap-2">
              <Sparkles size={16} className="text-purple-400" />
              AI 技術分析（Groq · Llama）
            </h3>
            <button
              onClick={runAiAnalysis}
              disabled={aiLoading || loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
            >
              {aiLoading ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <Sparkles size={12} />}
              {aiLoading ? '分析中...' : aiAnalysis ? '重新分析' : '開始分析'}
            </button>
          </div>

          {aiLoading && (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-4 bg-gray-700 rounded animate-pulse" style={{ width: `${85 - i * 10}%` }} />)}
            </div>
          )}

          {aiError && (
            <div className="text-red-400 text-sm p-3 bg-red-900/20 rounded-xl">
              {aiError.includes('NO_KEY') ? (
                <span>請先點右上角 ⚙️ 設定 Grok API Key</span>
              ) : aiError}
            </div>
          )}

          {aiAnalysis && !aiLoading && (
            <div className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">{aiAnalysis}</div>
          )}

          {!aiAnalysis && !aiLoading && !aiError && (
            <div className="text-center py-8 space-y-3">
              <div className="text-3xl">🤖</div>
              <p className="text-gray-400 text-sm">
                {grokKey ? '點上方「開始分析」，Grok 將根據技術指標與籌碼給出分析' : '請先點右上角 ⚙️ 輸入 Grok API Key'}
              </p>
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-gray-700 text-xs text-gray-500">
            ⚠️ AI 分析僅供參考，不構成投資建議。投資有風險，請自行判斷。
          </div>
        </div>
      )}
    </div>
  )
}
