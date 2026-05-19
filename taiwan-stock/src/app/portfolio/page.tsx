'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Briefcase, Trash2 } from 'lucide-react'
import { usePortfolio, PortfolioItem } from '@/lib/storage'

interface PriceInfo {
  price: number | null
  loading: boolean
}

export default function PortfolioPage() {
  const { list, remove } = usePortfolio()
  const router = useRouter()
  const [prices, setPrices] = useState<Record<string, PriceInfo>>({})

  useEffect(() => {
    if (list.length === 0) return
    // Fetch price for each unique stock code
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
          if (data && data.length > 0) {
            const last = data[data.length - 1]
            setPrices(p => ({ ...p, [code]: { price: last.close, loading: false } }))
          } else {
            setPrices(p => ({ ...p, [code]: { price: null, loading: false } }))
          }
        })
        .catch(() => {
          setPrices(p => ({ ...p, [code]: { price: null, loading: false } }))
        })
    })
  }, [list])

  if (list.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 flex flex-col items-center gap-4 text-center">
        <Briefcase size={48} className="text-gray-600" />
        <p className="text-white text-lg font-semibold">尚未新增持倉</p>
      </div>
    )
  }

  const uniqueCodes = Array.from(new Set(list.map((i: PortfolioItem) => i.code)))
  const allLoaded = uniqueCodes.every(code => prices[code] && !prices[code].loading)

  // Summary calculations
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
      <h1 className="text-white text-xl font-bold mb-4">庫藏股</h1>

      {/* Summary card */}
      <div className="bg-gray-800 border border-gray-700 rounded-2xl p-4 mb-4">
        {!allLoaded ? (
          <div className="space-y-2">
            <div className="h-4 w-32 bg-gray-700 rounded animate-pulse" />
            <div className="h-6 w-24 bg-gray-700 rounded animate-pulse" />
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
              className="bg-gray-800 border border-gray-700 rounded-2xl p-4 cursor-pointer hover:bg-gray-750 transition-colors"
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
    </div>
  )
}
