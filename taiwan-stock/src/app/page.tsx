import SearchBar from '@/components/SearchBar'
import Link from 'next/link'
import { TrendingUp, ScanLine, Sparkles } from 'lucide-react'

const HOT_STOCKS = [
  { code: '2330', name: '台積電' },
  { code: '2317', name: '鴻海' },
  { code: '2454', name: '聯發科' },
  { code: '2881', name: '富邦金' },
  { code: '2382', name: '廣達' },
  { code: '6505', name: '台塑化' },
  { code: '2412', name: '中華電' },
  { code: '3711', name: '日月光投控' },
]

export default function HomePage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <div className="text-4xl mb-3">📈</div>
        <h1 className="text-2xl font-bold text-white mb-1">台股分析工具</h1>
        <p className="text-gray-400 text-sm">盤後籌碼・技術指標・掃股選股・AI 分析</p>
      </div>

      <SearchBar />

      <div className="mt-6">
        <div className="text-xs text-gray-500 mb-3 uppercase tracking-wide font-medium">熱門股票</div>
        <div className="flex flex-wrap gap-2">
          {HOT_STOCKS.map(s => (
            <Link
              key={s.code}
              href={`/stock/${s.code}`}
              className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-xl text-sm transition-colors border border-gray-700"
            >
              <span className="text-blue-400 font-mono font-bold">{s.code}</span>
              <span className="text-gray-300">{s.name}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link href="/scanner" className="group flex items-center gap-4 p-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-2xl transition-colors">
          <div className="p-3 bg-blue-600/20 rounded-xl text-blue-400 group-hover:bg-blue-600/30 transition-colors">
            <ScanLine size={22} />
          </div>
          <div>
            <div className="font-semibold text-white">掃股選股</div>
            <div className="text-xs text-gray-400 mt-0.5">多條件 AND/OR 篩選</div>
          </div>
        </Link>

        <Link href="/stock/2330" className="group flex items-center gap-4 p-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-2xl transition-colors">
          <div className="p-3 bg-green-600/20 rounded-xl text-green-400 group-hover:bg-green-600/30 transition-colors">
            <TrendingUp size={22} />
          </div>
          <div>
            <div className="font-semibold text-white">個股分析</div>
            <div className="text-xs text-gray-400 mt-0.5">K線・指標・籌碼・財報</div>
          </div>
        </Link>

        <Link href="/stock/2330#ai" className="group flex items-center gap-4 p-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-2xl transition-colors sm:col-span-2">
          <div className="p-3 bg-purple-600/20 rounded-xl text-purple-400 group-hover:bg-purple-600/30 transition-colors">
            <Sparkles size={22} />
          </div>
          <div>
            <div className="font-semibold text-white">AI 技術分析 <span className="ml-1 text-xs bg-purple-600 text-white px-1.5 py-0.5 rounded-full align-middle">Groq 免費</span></div>
            <div className="text-xs text-gray-400 mt-0.5">進入個股頁面 → AI 分析 tab・需設定 Grok API Key</div>
          </div>
        </Link>
      </div>
    </div>
  )
}
