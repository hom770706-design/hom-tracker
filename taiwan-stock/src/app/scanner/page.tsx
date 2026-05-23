'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ScannerBuilder from '@/components/ScannerBuilder'
import { ScanGroup, ScanConditionOperator, ScanResult } from '@/lib/types'
import { TrendingUp, TrendingDown, ChevronRight, AlertCircle } from 'lucide-react'

export default function ScannerPage() {
  const [results, setResults] = useState<ScanResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanTime, setScanTime] = useState<number | null>(null)
  const router = useRouter()

  const handleScan = async (groups: ScanGroup[], globalOperator: ScanConditionOperator) => {
    setLoading(true)
    setError(null)
    const start = Date.now()
    try {
      const res = await fetch('/api/scanner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groups, globalOperator }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setResults(json.data)
      setScanTime(Date.now() - start)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-4">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white mb-1">掃股選股</h1>
        <p className="text-gray-400 text-sm">勾選條件並設定 AND/OR 邏輯，掃描台股前 60 大成交量股票</p>
      </div>

      <ScannerBuilder onScan={handleScan} loading={loading} />

      {error && (
        <div className="mt-4 flex items-center gap-3 p-4 bg-red-900/30 border border-red-700 rounded-xl text-red-400 text-sm">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {results !== null && !loading && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-semibold">
              掃股結果
              <span className="ml-2 bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">{results.length} 檔</span>
            </h2>
            {scanTime && <span className="text-xs text-gray-500">{(scanTime / 1000).toFixed(1)}s</span>}
          </div>

          {results.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <div className="text-3xl mb-2">🔍</div>
              <div>沒有符合條件的股票</div>
              <div className="text-sm mt-1">試著放寬條件或改用 OR 邏輯</div>
            </div>
          ) : (
            <div className="space-y-2">
              {results.map(r => (
                <button
                  key={r.code}
                  onClick={() => router.push(`/stock/${r.code}`)}
                  className="w-full flex items-center justify-between p-4 bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-xl transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-blue-400">{r.code}</span>
                        <span className="text-white text-sm">{r.name}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {r.matched_conditions.slice(0, 3).map((c, i) => (
                          <span key={i} className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">{c}</span>
                        ))}
                        {r.matched_conditions.length > 3 && (
                          <span className="text-xs text-gray-500">+{r.matched_conditions.length - 3}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className={`font-bold ${r.change_pct >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {r.close.toFixed(2)}
                      </div>
                      <div className={`text-xs flex items-center justify-end gap-0.5 ${r.change_pct >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {r.change_pct >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                        {r.change_pct >= 0 ? '+' : ''}{r.change_pct.toFixed(2)}%
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-gray-600 group-hover:text-gray-400 transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
