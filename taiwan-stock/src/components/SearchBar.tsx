'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X } from 'lucide-react'

export default function SearchBar({ placeholder = '輸入股票代號或名稱（如：2330 或 台積電）' }: { placeholder?: string }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ code: string; name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const ref = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const search = (q: string) => {
    setQuery(q)
    clearTimeout(timer.current)
    if (!q.trim()) { setResults([]); setOpen(false); return }
    timer.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
        const json = await res.json()
        setResults(json.data || [])
        setOpen(true)
      } finally {
        setLoading(false)
      }
    }, 300)
  }

  const select = (code: string) => {
    setQuery('')
    setOpen(false)
    router.push(`/stock/${code}`)
  }

  return (
    <div ref={ref} className="relative w-full max-w-xl mx-auto">
      <div className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 focus-within:border-blue-500 transition-colors">
        <Search size={18} className="text-gray-400 shrink-0" />
        <input
          value={query}
          onChange={e => search(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent outline-none text-white placeholder-gray-500 text-sm"
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {loading && <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />}
        {query && !loading && (
          <button onClick={() => { setQuery(''); setResults([]); setOpen(false) }}>
            <X size={16} className="text-gray-400 hover:text-white" />
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-xl overflow-hidden shadow-2xl z-50">
          {results.map(r => (
            <button
              key={r.code}
              onClick={() => select(r.code)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-700 transition-colors text-left"
            >
              <span className="font-mono text-blue-400 font-bold text-sm w-12">{r.code}</span>
              <span className="text-white text-sm">{r.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
