'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Briefcase, Trash2, Plus, X } from 'lucide-react'
import { usePortfolio, PortfolioItem } from '@/lib/storage'

interface PriceInfo {
  price: number | null
  loading: boolean
}

function AddPortfolioModal({ onClose }: { onClose: () => void }) {
  const { add } = usePortfolio()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [lookupError, setLookupError] = useState('')
  const [looking, setLooking] = useState(false)
  const [buyDate, setBuyDate] = useState(new Date().toISOString().slice(0, 10))
  const [buyPrice, setBuyPrice] = useState('')
  const [shares, setShares] = useState('1')

  const lookup = async (c: string) => {
    const trimmed = c.trim()
    if (!trimmed) return
    setLooking(true)
    setName('')
    setLookupError('')
    try {
      const [infoRes, priceRes] = await Promise.all([
        fetch(`/api/stock/${trimmed}/info`),
        fetch(`/api/stock/${trimmed}/price?days=5`),
      ])
      const infoJson = await infoRes.json()
      const priceJson = await priceRes.json()
      if (infoJson.data?.name) {
        setName(infoJson.data.name)
        const lastClose = priceJson.data?.at(-1)?.close
        if (lastClose) setBuyPrice(lastClose.toFixed(2))
      } else {
        setLookupError('找不到此股票代號')
      }
    } catch {
      setLookupError('查詢失敗，請重試')
    } finally {
      setLooking(false)
    }
  }

  const save = () => {
    const price = parseFloat(buyPrice)
    const qty = parseFloat(shares)
    if (!code.trim() || !name || !price || !qty || price <= 0 || qty <= 0 || !buyDate) return
    add({ code: code.trim(), name, buyDate, buyPrice: price, shares: qty })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-800 border border-gray-700 rounded-2xl w-full max-w-sm p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold">新增庫藏股</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1"><X size={18} /></button>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">股票代號</label>
          <input
            type="text"
            value={code}
            onChange={e => { setCode(e.target.value); setName(''); setLookupError('') }}
            onBlur={() => lookup(code)}
            placeholder="e.g. 2330"
            className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-blue-500"
          />
          {looking && <p className="text-xs text-gray-500 mt-1.5">查詢中...</p>}
          {name && <p className="text-xs text-green-400 mt-1.5">✓ {name}</p>}
          {lookupError && <p className="text-xs text-red-400 mt-1.5">{lookupError}</p>}
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">買進日期</label>
          <input
            type="date"
            value={buyDate}
            onChange={e => setBuyDate(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">買進成本（元/股）</label>
          <input
            type="number"
            value={buyPrice}
            onChange={e => setBuyPrice(e.target.value)}
            placeholder="e.g. 850"
            className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">數量（張，1張＝1000股）</label>
          <input
            type="number"
            value={shares}
            onChange={e => setShares(e.target.value)}
            placeholder="e.g. 1"
            min="1"
            className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose}
            className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-xl text-sm transition-colors">
            取消
          </button>
          <button onClick={save} disabled={!name || !buyPrice || !shares}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl text-sm font-medium transition-colors">
            確認儲存
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PortfolioPage() {
  const { list, remove } = usePortfolio()
  const router = useRouter()
  const [prices, setPrices] = useState<Record<string, PriceInfo>>({})
  const [addOpen, setAddOpen] = useState(false)

  useEffect(() => {
    if (list.length === 0) return
    const codes = Array.from(new Set(list.map((i: PortfolioItem) => i.code)))
    codes.forEach(code => {
      setPrices(prev => ({
        ...prev,
        [code]: prev[code] ?? { price: null, loading: true },
      }))
      fetch(`/api/stock/${code}/price?days=5`)
        .then(r => r.json())
        .then((json: { data?: Array<{ close: number; date: string }> }) => {
          const data = json.data
          const last = data && data.length > 0 ? data[data.length - 1] : null
          setPrices(p => ({ ...p, [code]: { price: last?.close ?? null, loading: false } }))
        })
        .catch(() => {
          setPrices(p => ({ ...p, [code]: { price: null, loading: false } }))
        })
    })
  }, [list])

  const uniqueCodes = Array.from(new Set(list.map((i: PortfolioItem) => i.code)))
  const allLoaded = uniqueCodes.every(code => prices[code] && !prices[code].loading)

  let totalCost = 0
  let totalValue = 0
  if (allLoaded) {
    list.forEach((item: PortfolioItem) => {
      const p = prices[item.code]
      totalCost += item.buyPrice * item.shares * 1000
      if (p?.price !== null && p?.price !== undefined) {
        totalValue += p.price * item.shares * 1000
      }
    })
  }
  const totalPnl = totalValue - totalCost

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-white text-xl font-bold">庫藏股</h1>
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-xl transition-colors"
        >
          <Plus size={15} />
          新增
        </button>
      </div>

      {list.length === 0 ? (
        <div className="flex flex-col items-center gap-4 text-center py-16">
          <Briefcase size={48} className="text-gray-600" />
          <p className="text-white text-lg font-semibold">尚未新增持倉</p>
          <p className="text-gray-400 text-sm">點右上角「新增」，或進入個股頁面點 🗂 記錄買進</p>
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-xl transition-colors"
          >
            <Plus size={15} />
            新增持倉
          </button>
        </div>
      ) : (
        <>
          {/* Summary card */}
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-4 mb-4">
            {!allLoaded ? (
              <div className="grid grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i}>
                    <div className="h-3 w-10 bg-gray-700 rounded animate-pulse mb-2" />
                    <div className="h-5 w-16 bg-gray-700 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-gray-500 mb-1">總成本</p>
                  <p className="text-white font-semibold">{(totalCost / 10000).toFixed(2)} 萬</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">市值</p>
                  <p className="text-white font-semibold">{(totalValue / 10000).toFixed(2)} 萬</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">損益</p>
                  <p className={`font-semibold ${totalPnl >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {totalPnl >= 0 ? '+' : ''}{(totalPnl / 10000).toFixed(2)} 萬
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Holdings list */}
          <div className="space-y-3">
            {list.map((item: PortfolioItem) => {
              const info = prices[item.code]
              const currentPrice = info?.price ?? null
              const pnl = currentPrice !== null ? (currentPrice - item.buyPrice) * item.shares * 1000 : null
              const pnlPct = currentPrice !== null ? ((currentPrice - item.buyPrice) / item.buyPrice) * 100 : null
              const isUp = pnl !== null && pnl >= 0

              return (
                <div
                  key={item.id}
                  onClick={() => router.push(`/stock/${item.code}`)}
                  className="bg-gray-800 border border-gray-700 rounded-2xl p-4 cursor-pointer hover:border-gray-600 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <span className="font-mono text-blue-400 font-semibold mr-2">{item.code}</span>
                      <span className="text-gray-300 text-sm">{item.name}</span>
                    </div>
                    {info?.loading !== false ? (
                      <div className="h-5 w-16 bg-gray-700 rounded animate-pulse" />
                    ) : (
                      <div className="text-right">
                        <p className={`font-semibold ${isUp ? 'text-red-400' : 'text-green-400'}`}>
                          {currentPrice !== null ? currentPrice.toFixed(2) : '--'}
                        </p>
                        {pnlPct !== null && (
                          <p className={`text-xs ${isUp ? 'text-red-400' : 'text-green-400'}`}>
                            {isUp ? '+' : ''}{pnlPct.toFixed(2)}%
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-sm mb-3">
                    <div>
                      <p className="text-xs text-gray-500">買進價</p>
                      <p className="text-gray-200">{item.buyPrice.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">數量（張）</p>
                      <p className="text-gray-200">{item.shares}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">買進日</p>
                      <p className="text-gray-200">{item.buyDate}</p>
                    </div>
                  </div>

                  {info?.loading === false && pnl !== null && (
                    <div className={`text-sm font-medium ${isUp ? 'text-red-400' : 'text-green-400'}`}>
                      損益：{isUp ? '+' : ''}{(pnl / 10000).toFixed(2)} 萬元
                    </div>
                  )}

                  <div className="mt-3 pt-3 border-t border-gray-700 flex justify-end">
                    <button
                      onClick={e => { e.stopPropagation(); remove(item.id) }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-700 rounded-lg transition-colors text-xs"
                    >
                      <Trash2 size={13} />
                      刪除
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {addOpen && <AddPortfolioModal onClose={() => setAddOpen(false)} />}
    </div>
  )
}
