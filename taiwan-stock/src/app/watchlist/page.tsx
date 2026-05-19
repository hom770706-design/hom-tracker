'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Star, Trash2 } from 'lucide-react'
import { useWatchlist, WatchlistItem } from '@/lib/storage'

interface PriceInfo {
  price: number | null
  changePct: number | null
  loading: boolean
}

export default function WatchlistPage() {
  const { list, remove } = useWatchlist()
  const router = useRouter()
  const [prices, setPrices] = useState<Record<string, PriceInfo>>({})

  useEffect(() => {
    if (list.length === 0) return
    list.forEach((item: WatchlistItem) => {
      setPrices(prev => ({
        ...prev,
        [item.code]: prev[item.code] ?? { price: null, changePct: null, loading: true },
      }))
      fetch(`/api/stock/${item.code}/price?days=5`)
        .then(r => r.json())
        .then((json: { data?: Array<{ close: number; date: string }> }) => {
          const data = json.data
          if (data && data.length >= 2) {
            const last = data[data.length - 1]
            const prev = data[data.length - 2]
            const pct = ((last.close - prev.close) / prev.close) * 100
            setPrices(p => ({ ...p, [item.code]: { price: last.close, changePct: pct, loading: false } }))
          } else if (data && data.length === 1) {
            setPrices(p => ({ ...p, [item.code]: { price: data[0].close, changePct: null, loading: false } }))
          } else {
            setPrices(p => ({ ...p, [item.code]: { price: null, changePct: null, loading: false } }))
          }
        })
        .catch(() => {
          setPrices(p => ({ ...p, [item.code]: { price: null, changePct: null, loading: false } }))
        })
    })
  }, [list])

  if (list.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 flex flex-col items-center gap-4 text-center">
        <Star size={48} className="text-gray-600" />
        <p className="text-white text-lg font-semibold">尚未新增自選股</p>
        <p className="text-gray-400 text-sm">進入個股頁面，點擊 ★ 即可加入</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      <h1 className="text-white text-xl font-bold mb-4">自選股</h1>
      <div className="space-y-2">
        {list.map((item: WatchlistItem) => {
          const info = prices[item.code]
          const isUp = info?.changePct !== null && info?.changePct !== undefined && info.changePct >= 0
          return (
            <div
              key={item.code}
              onClick={() => router.push(`/stock/${item.code}`)}
              className="bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-750 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-blue-400 font-semibold">{item.code}</span>
                <span className="text-gray-300 text-sm">{item.name}</span>
              </div>
              <div className="flex items-center gap-3">
                {info?.loading !== false ? (
                  <div className="flex flex-col items-end gap-1">
                    <div className="h-4 w-16 bg-gray-700 rounded animate-pulse" />
                    <div className="h-3 w-10 bg-gray-700 rounded animate-pulse" />
                  </div>
                ) : (
                  <div className="flex flex-col items-end">
                    <span className={`font-semibold ${isUp ? 'text-red-400' : 'text-green-400'}`}>
                      {info.price !== null ? info.price.toFixed(2) : '--'}
                    </span>
                    {info.changePct !== null && (
                      <span className={`text-xs ${isUp ? 'text-red-400' : 'text-green-400'}`}>
                        {isUp ? '+' : ''}{info.changePct.toFixed(2)}%
                      </span>
                    )}
                  </div>
                )}
                <button
                  onClick={e => { e.stopPropagation(); remove(item.code) }}
                  className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-700 rounded-lg transition-colors"
                  title="移除"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
