'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Star, Trash2, Plus, X, RefreshCw } from 'lucide-react'
import { useWatchlist, WatchlistItem } from '@/lib/storage'

interface PriceInfo {
  price: number | null
  changePct: number | null
  loading: boolean
}

function AddWatchModal({ onClose }: { onClose: () => void }) {
  const { toggle } = useWatchlist()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [lookupError, setLookupError] = useState('')
  const [looking, setLooking] = useState(false)

  const lookup = async (c: string) => {
    const trimmed = c.trim()
    if (!trimmed) return
    setLooking(true)
    setName('')
    setLookupError('')
    try {
      const res = await fetch(`/api/stock/${trimmed}/info`)
      const json = await res.json()
      if (json.data?.name) setName(json.data.name)
      else setLookupError('找不到此股票代號')
    } catch {
      setLookupError('查詢失敗，請重試')
    } finally {
      setLooking(false)
    }
  }

  const save = () => {
    if (!code.trim() || !name) return
    toggle({ code: code.trim(), name })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-800 border border-gray-700 rounded-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold">新增自選股</h2>
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
        <div className="flex gap-2 pt-1">
          <button onClick={onClose}
            className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-xl text-sm transition-colors">
            取消
          </button>
          <button onClick={save} disabled={!name}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl text-sm font-medium transition-colors">
            加入
          </button>
        </div>
      </div>
    </div>
  )
}

export default function WatchlistPage() {
  const { list, remove } = useWatchlist()
  const router = useRouter()
  const [prices, setPrices] = useState<Record<string, PriceInfo>>({})
  const [addOpen, setAddOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [fetchKey, setFetchKey] = useState(0)
  const lastFetchTime = useRef(0)

  useEffect(() => {
    if (list.length === 0) { setPrices({}); return }
    lastFetchTime.current = Date.now()
    setRefreshing(true)

    const init: Record<string, PriceInfo> = {}
    list.forEach(item => { init[item.code] = { price: null, changePct: null, loading: true } })
    setPrices(init)

    Promise.all(
      list.map((item: WatchlistItem) =>
        fetch(`/api/stock/${item.code}/price?days=5`)
          .then(r => r.json())
          .then((json: { data?: Array<{ close: number }> }) => {
            const data = json.data ?? []
            const last = data.at(-1)
            const prev = data.at(-2)
            return {
              code: item.code,
              info: last
                ? { price: last.close, changePct: prev ? (last.close - prev.close) / prev.close * 100 : null, loading: false }
                : { price: null, changePct: null, loading: false }
            }
          })
          .catch(() => ({ code: item.code, info: { price: null, changePct: null, loading: false } }))
      )
    ).then(results => {
      const map: Record<string, PriceInfo> = {}
      results.forEach(r => { map[r.code] = r.info })
      setPrices(map)
    }).finally(() => setRefreshing(false))
  }, [list, fetchKey])

  // Re-fetch when app comes back to foreground (PWA home screen support)
  useEffect(() => {
    const handle = () => {
      if (document.visibilityState === 'visible') {
        const staleMs = 5 * 60 * 1000 // 5 minutes
        if (Date.now() - lastFetchTime.current > staleMs) {
          setFetchKey(k => k + 1)
        }
      }
    }
    document.addEventListener('visibilitychange', handle)
    return () => document.removeEventListener('visibilitychange', handle)
  }, [])

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-white text-xl font-bold">自選股</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFetchKey(k => k + 1)}
            disabled={refreshing}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-40"
            title="重新整理"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-xl transition-colors"
          >
            <Plus size={15} />
            新增
          </button>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="flex flex-col items-center gap-4 text-center py-16">
          <Star size={48} className="text-gray-600" />
          <p className="text-white text-lg font-semibold">尚未新增自選股</p>
          <p className="text-gray-400 text-sm">點右上角「新增」，或進入個股頁面點 ★</p>
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-xl transition-colors"
          >
            <Plus size={15} />
            新增自選股
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((item: WatchlistItem) => {
            const info = prices[item.code]
            const isUp = info?.changePct != null && info.changePct >= 0
            return (
              <div
                key={item.code}
                onClick={() => router.push(`/stock/${item.code}`)}
                className="bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 flex items-center justify-between cursor-pointer hover:border-gray-600 transition-colors"
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
                        {info.price != null ? info.price.toFixed(2) : '--'}
                      </span>
                      {info.changePct != null && (
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
      )}

      {addOpen && <AddWatchModal onClose={() => setAddOpen(false)} />}
    </div>
  )
}
