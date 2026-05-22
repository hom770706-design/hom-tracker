'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Briefcase, Trash2, Plus, X, RefreshCw, Receipt, ChevronDown, ChevronUp } from 'lucide-react'
import { usePortfolio, useSold, PortfolioItem, SoldItem } from '@/lib/storage'

interface PriceInfo { price: number | null; loading: boolean }

const DEFAULT_BUY_FEE = '0.1425'
const DEFAULT_SELL_FEE = '0.1425'

function isETF(code: string) { return /^0\d{4,5}$/.test(code) }

function calcNetPnl(
  buyPrice: number, sellPrice: number, shares: number,
  bfr: number, sfr: number, tr: number
) {
  const qty = shares * 1000
  const buyFee = buyPrice * qty * bfr
  const sellFee = sellPrice * qty * sfr
  const tax = sellPrice * qty * tr
  const totalCost = buyPrice * qty + buyFee
  const netRevenue = sellPrice * qty - sellFee - tax
  return { buyFee, sellFee, tax, totalCost, netRevenue, pnl: netRevenue - totalCost }
}

function soldNetPnl(item: SoldItem) {
  return calcNetPnl(
    item.buyPrice, item.sellPrice, item.shares,
    item.buyFeeRate ?? 0, item.sellFeeRate ?? 0, item.taxRate ?? 0
  ).pnl
}

// ── Fee Rate Inputs ──────────────────────────────────────────────────────────
function FeeInputs({ buyFee, setBuyFee, sellFee, setSellFee, taxRate, setTaxRate }: {
  buyFee: string; setBuyFee: (v: string) => void
  sellFee: string; setSellFee: (v: string) => void
  taxRate: string; setTaxRate: (v: string) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {([
        ['買進手續費 (%)', buyFee, setBuyFee],
        ['賣出手續費 (%)', sellFee, setSellFee],
        ['證交稅 (%)', taxRate, setTaxRate],
      ] as [string, string, (v: string) => void][]).map(([label, val, set]) => (
        <div key={label}>
          <label className="block text-xs text-gray-500 mb-1">{label}</label>
          <input type="number" value={val} onChange={e => set(e.target.value)} step="0.001"
            className="w-full bg-gray-700 border border-gray-600 rounded-xl px-2 py-2 text-white text-xs outline-none focus:border-blue-500" />
        </div>
      ))}
    </div>
  )
}

// ── Sell Modal ───────────────────────────────────────────────────────────────
function SellModal({ item, currentPrice, onConfirm, onClose }: {
  item: PortfolioItem
  currentPrice: number | null
  onConfirm: (sellDate: string, sellPrice: number, bfr: number, sfr: number, tr: number) => void
  onClose: () => void
}) {
  const [sellDate, setSellDate] = useState(new Date().toISOString().slice(0, 10))
  const [sellPrice, setSellPrice] = useState(currentPrice?.toFixed(2) ?? '')
  const [buyFee, setBuyFee] = useState(DEFAULT_BUY_FEE)
  const [sellFee, setSellFee] = useState(DEFAULT_SELL_FEE)
  const [taxRate, setTaxRate] = useState(isETF(item.code) ? '0.1' : '0.3')
  const [showFees, setShowFees] = useState(false)

  const sp = parseFloat(sellPrice)
  const bfr = parseFloat(buyFee) / 100
  const sfr = parseFloat(sellFee) / 100
  const tr = parseFloat(taxRate) / 100
  const fees = sp > 0 ? calcNetPnl(item.buyPrice, sp, item.shares, bfr, sfr, tr) : null
  const pnlPct = fees ? fees.pnl / fees.totalCost * 100 : null
  const isUp = fees ? fees.pnl >= 0 : false

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-800 border border-gray-700 rounded-2xl w-full max-w-sm p-6 space-y-3 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold">賣出</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1"><X size={18} /></button>
        </div>
        <div className="text-sm text-gray-400 bg-gray-900/40 rounded-xl p-3 space-y-0.5">
          <div><span className="font-mono text-blue-400 font-semibold">{item.code}</span> {item.name}</div>
          <div>買進：{item.buyDate} @ {item.buyPrice} × {item.shares} 張</div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">賣出日期</label>
          <input type="date" value={sellDate} onChange={e => setSellDate(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-orange-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">賣出價格（元/股）</label>
          <input type="number" value={sellPrice} onChange={e => setSellPrice(e.target.value)} placeholder="e.g. 950"
            className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-orange-500" />
        </div>

        {/* Fee breakdown */}
        {fees && (
          <div className="bg-gray-900/40 rounded-xl p-3 space-y-1 text-xs">
            <div className="flex justify-between text-gray-400">
              <span>買進手續費（{buyFee}%）</span>
              <span>-{Math.round(fees.buyFee).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>賣出手續費（{sellFee}%）</span>
              <span>-{Math.round(fees.sellFee).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>證交稅（{taxRate}%）</span>
              <span>-{Math.round(fees.tax).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-gray-500 border-t border-gray-700 pt-1.5">
              <span>合計費用</span>
              <span>-{Math.round(fees.buyFee + fees.sellFee + fees.tax).toLocaleString()}</span>
            </div>
          </div>
        )}

        {/* Toggle fee settings */}
        <button onClick={() => setShowFees(v => !v)}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors">
          {showFees ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {showFees ? '收起費率設定' : '調整費率（如有折扣）'}
        </button>
        {showFees && (
          <FeeInputs buyFee={buyFee} setBuyFee={setBuyFee}
            sellFee={sellFee} setSellFee={setSellFee}
            taxRate={taxRate} setTaxRate={setTaxRate} />
        )}

        {/* Net P&L */}
        {fees && pnlPct != null && (
          <div className={`text-sm font-medium px-3 py-2 rounded-xl ${isUp ? 'bg-red-900/20 text-red-400' : 'bg-green-900/20 text-green-400'}`}>
            實現損益（含費）：{isUp ? '+' : ''}{(fees.pnl / 10000).toFixed(2)} 萬（{isUp ? '+' : ''}{pnlPct.toFixed(1)}%）
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-xl text-sm transition-colors">取消</button>
          <button onClick={() => { if (sp > 0 && sellDate) onConfirm(sellDate, sp, bfr, sfr, tr) }}
            disabled={!(sp > 0) || !sellDate}
            className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white rounded-xl text-sm font-medium transition-colors">
            確認賣出
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Add Portfolio Modal ──────────────────────────────────────────────────────
function AddPortfolioModal({ onClose }: { onClose: () => void }) {
  const { add } = usePortfolio()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const [looking, setLooking] = useState(false)
  const [buyDate, setBuyDate] = useState(new Date().toISOString().slice(0, 10))
  const [buyPrice, setBuyPrice] = useState('')
  const [shares, setShares] = useState('1')

  const lookup = async (c: string) => {
    const t = c.trim(); if (!t) return
    setLooking(true); setName(''); setErr('')
    try {
      const [ir, pr] = await Promise.all([fetch(`/api/stock/${t}/info`), fetch(`/api/stock/${t}/price?days=5`)])
      const ij = await ir.json(); const pj = await pr.json()
      if (ij.data?.name) { setName(ij.data.name); const lc = pj.data?.at(-1)?.close; if (lc) setBuyPrice(lc.toFixed(2)) }
      else setErr('找不到此股票代號')
    } catch { setErr('查詢失敗') } finally { setLooking(false) }
  }

  const save = () => {
    const p = parseFloat(buyPrice), s = parseFloat(shares)
    if (!code.trim() || !name || !p || !s || !buyDate) return
    add({ code: code.trim(), name, buyDate, buyPrice: p, shares: s })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-800 border border-gray-700 rounded-2xl w-full max-w-sm p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold">新增持倉</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1"><X size={18} /></button>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">股票代號</label>
          <input type="text" value={code} onChange={e => { setCode(e.target.value); setName(''); setErr('') }}
            onBlur={() => lookup(code)} placeholder="e.g. 2330"
            className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-blue-500" />
          {looking && <p className="text-xs text-gray-500 mt-1">查詢中...</p>}
          {name && <p className="text-xs text-green-400 mt-1">✓ {name}</p>}
          {err && <p className="text-xs text-red-400 mt-1">{err}</p>}
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">買進日期</label>
          <input type="date" value={buyDate} onChange={e => setBuyDate(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-blue-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">買進成本（元/股）</label>
          <input type="number" value={buyPrice} onChange={e => setBuyPrice(e.target.value)} placeholder="e.g. 850"
            className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-blue-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">數量（張，1張＝1000股）</label>
          <input type="number" value={shares} onChange={e => setShares(e.target.value)} min="1"
            className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-blue-500" />
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-xl text-sm transition-colors">取消</button>
          <button onClick={save} disabled={!name || !buyPrice || !shares}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl text-sm font-medium transition-colors">確認儲存</button>
        </div>
      </div>
    </div>
  )
}

// ── Add Sold Modal ───────────────────────────────────────────────────────────
function AddSoldModal({ onClose }: { onClose: () => void }) {
  const { add } = useSold()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const [looking, setLooking] = useState(false)
  const [buyDate, setBuyDate] = useState('')
  const [buyPrice, setBuyPrice] = useState('')
  const [shares, setShares] = useState('1')
  const [sellDate, setSellDate] = useState(new Date().toISOString().slice(0, 10))
  const [sellPrice, setSellPrice] = useState('')
  const [buyFee, setBuyFee] = useState(DEFAULT_BUY_FEE)
  const [sellFee, setSellFee] = useState(DEFAULT_SELL_FEE)
  const [taxRate, setTaxRate] = useState('0.3')
  const [showFees, setShowFees] = useState(false)

  const lookup = async (c: string) => {
    const t = c.trim(); if (!t) return
    setLooking(true); setName(''); setErr('')
    try {
      const r = await fetch(`/api/stock/${t}/info`)
      const j = await r.json()
      if (j.data?.name) {
        setName(j.data.name)
        setTaxRate(isETF(t) ? '0.1' : '0.3')
      } else { setErr('找不到此股票代號') }
    } catch { setErr('查詢失敗') } finally { setLooking(false) }
  }

  const bp = parseFloat(buyPrice), sp = parseFloat(sellPrice), qty = parseFloat(shares)
  const bfr = parseFloat(buyFee) / 100
  const sfr = parseFloat(sellFee) / 100
  const tr = parseFloat(taxRate) / 100
  const fees = bp > 0 && sp > 0 && qty > 0 ? calcNetPnl(bp, sp, qty, bfr, sfr, tr) : null
  const pnlPct = fees ? fees.pnl / fees.totalCost * 100 : null
  const isUp = fees ? fees.pnl >= 0 : false

  const save = () => {
    if (!code.trim() || !name || !buyDate || !bp || !qty || !sellDate || !sp) return
    add({ code: code.trim(), name, buyDate, buyPrice: bp, shares: qty, sellDate, sellPrice: sp, buyFeeRate: bfr, sellFeeRate: sfr, taxRate: tr })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-800 border border-gray-700 rounded-2xl w-full max-w-sm p-6 space-y-3 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold">手動新增賣出紀錄</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1"><X size={18} /></button>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">股票代號</label>
          <input type="text" value={code} onChange={e => { setCode(e.target.value); setName(''); setErr('') }}
            onBlur={() => lookup(code)} placeholder="e.g. 2330"
            className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-blue-500" />
          {looking && <p className="text-xs text-gray-500 mt-1">查詢中...</p>}
          {name && <p className="text-xs text-green-400 mt-1">✓ {name}</p>}
          {err && <p className="text-xs text-red-400 mt-1">{err}</p>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">買進日期</label>
            <input type="date" value={buyDate} onChange={e => setBuyDate(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">買進價（元/股）</label>
            <input type="number" value={buyPrice} onChange={e => setBuyPrice(e.target.value)} placeholder="e.g. 680"
              className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-blue-500" />
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">數量（張）</label>
          <input type="number" value={shares} onChange={e => setShares(e.target.value)} min="1"
            className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-blue-500" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">賣出日期</label>
            <input type="date" value={sellDate} onChange={e => setSellDate(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">賣出價（元/股）</label>
            <input type="number" value={sellPrice} onChange={e => setSellPrice(e.target.value)} placeholder="e.g. 950"
              className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-blue-500" />
          </div>
        </div>

        {/* Fee toggle */}
        <button onClick={() => setShowFees(v => !v)}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors">
          {showFees ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {showFees ? '收起費率設定' : '設定費率（含手續費/稅）'}
        </button>
        {showFees && (
          <FeeInputs buyFee={buyFee} setBuyFee={setBuyFee}
            sellFee={sellFee} setSellFee={setSellFee}
            taxRate={taxRate} setTaxRate={setTaxRate} />
        )}

        {/* P&L preview */}
        {fees && pnlPct != null && (
          <div className={`text-sm font-medium px-3 py-2 rounded-xl ${isUp ? 'bg-red-900/20 text-red-400' : 'bg-green-900/20 text-green-400'}`}>
            實現損益（含費）：{isUp ? '+' : ''}{(fees.pnl / 10000).toFixed(2)} 萬（{isUp ? '+' : ''}{pnlPct.toFixed(1)}%）
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-xl text-sm transition-colors">取消</button>
          <button onClick={save} disabled={!name || !buyDate || !buyPrice || !sellDate || !sellPrice}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl text-sm font-medium transition-colors">儲存</button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function PortfolioPage() {
  const { list: holdings, add: holdingAdd, remove: holdingRemove } = usePortfolio()
  const { list: soldList, add: soldAdd, remove: soldRemove } = useSold()
  const router = useRouter()
  const [tab, setTab] = useState<'holdings' | 'sold'>('holdings')
  const [prices, setPrices] = useState<Record<string, PriceInfo>>({})
  const [refreshing, setRefreshing] = useState(false)
  const [fetchKey, setFetchKey] = useState(0)
  const lastFetchTime = useRef(0)
  const [addOpen, setAddOpen] = useState(false)
  const [addSoldOpen, setAddSoldOpen] = useState(false)
  const [sellTarget, setSellTarget] = useState<{ item: PortfolioItem; price: number | null } | null>(null)

  useEffect(() => {
    if (holdings.length === 0) { setPrices({}); return }
    lastFetchTime.current = Date.now()
    setRefreshing(true)
    const codes = Array.from(new Set(holdings.map(i => i.code)))
    const init: Record<string, PriceInfo> = {}
    codes.forEach(c => { init[c] = { price: null, loading: true } })
    setPrices(init)
    Promise.all(
      codes.map(c =>
        fetch(`/api/stock/${c}/price?days=5`)
          .then(r => r.json())
          .then((j: { data?: Array<{ close: number }> }) => ({ c, price: j.data?.at(-1)?.close ?? null }))
          .catch(() => ({ c, price: null }))
      )
    ).then(rs => {
      const map: Record<string, PriceInfo> = {}
      rs.forEach(r => { map[r.c] = { price: r.price, loading: false } })
      setPrices(map)
    }).finally(() => setRefreshing(false))
  }, [holdings, fetchKey])

  useEffect(() => {
    const handle = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFetchTime.current > 5 * 60 * 1000)
        setFetchKey(k => k + 1)
    }
    document.addEventListener('visibilitychange', handle)
    return () => document.removeEventListener('visibilitychange', handle)
  }, [])

  const handleSell = (item: PortfolioItem, sellDate: string, sellPrice: number, bfr: number, sfr: number, tr: number) => {
    holdingRemove(item.id)
    soldAdd({ code: item.code, name: item.name, buyDate: item.buyDate, buyPrice: item.buyPrice, shares: item.shares, sellDate, sellPrice, buyFeeRate: bfr, sellFeeRate: sfr, taxRate: tr })
    setSellTarget(null)
  }

  // Holdings summary
  const codes = Array.from(new Set(holdings.map(i => i.code)))
  const allLoaded = codes.every(c => prices[c] && !prices[c].loading)
  let totalCost = 0, totalValue = 0
  if (allLoaded) {
    holdings.forEach(item => {
      const p = prices[item.code]?.price
      totalCost += item.buyPrice * item.shares * 1000
      if (p != null) totalValue += p * item.shares * 1000
    })
  }
  const holdingPnl = totalValue - totalCost

  // Sold summary (net P&L including fees)
  const totalRealizedPnl = soldList.reduce((s, i) => s + soldNetPnl(i), 0)
  const sortedSold = [...soldList].sort((a, b) => b.sellDate.localeCompare(a.sellDate))

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-white text-xl font-bold">庫藏股</h1>
        <div className="flex items-center gap-2">
          {tab === 'holdings' && (
            <button onClick={() => setFetchKey(k => k + 1)} disabled={refreshing}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-40" title="重新整理">
              <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            </button>
          )}
          <button onClick={() => tab === 'holdings' ? setAddOpen(true) : setAddSoldOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-xl transition-colors">
            <Plus size={15} />新增
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-800 p-1 rounded-xl">
        <button onClick={() => setTab('holdings')}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${tab === 'holdings' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'}`}>
          持倉中{holdings.length > 0 ? ` (${holdings.length})` : ''}
        </button>
        <button onClick={() => setTab('sold')}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${tab === 'sold' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'}`}>
          已賣出{soldList.length > 0 ? ` (${soldList.length})` : ''}
        </button>
      </div>

      {/* ── Holdings Tab ── */}
      {tab === 'holdings' && (
        holdings.length === 0 ? (
          <div className="flex flex-col items-center gap-4 text-center py-16">
            <Briefcase size={48} className="text-gray-600" />
            <p className="text-white text-lg font-semibold">尚未新增持倉</p>
            <p className="text-gray-400 text-sm">點右上角「新增」，或進入個股頁面點 🗂</p>
            <button onClick={() => setAddOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-xl transition-colors">
              <Plus size={15} />新增持倉
            </button>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="bg-gray-800 border border-gray-700 rounded-2xl p-4 mb-4">
              {!allLoaded ? (
                <div className="grid grid-cols-3 gap-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i}><div className="h-3 w-10 bg-gray-700 rounded animate-pulse mb-2" /><div className="h-5 w-16 bg-gray-700 rounded animate-pulse" /></div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  <div><p className="text-xs text-gray-500 mb-1">總成本</p><p className="text-white font-semibold">{(totalCost / 10000).toFixed(2)} 萬</p></div>
                  <div><p className="text-xs text-gray-500 mb-1">市值</p><p className="text-white font-semibold">{(totalValue / 10000).toFixed(2)} 萬</p></div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">浮動損益</p>
                    <p className={`font-semibold ${holdingPnl >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                      {holdingPnl >= 0 ? '+' : ''}{(holdingPnl / 10000).toFixed(2)} 萬
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Holdings list */}
            <div className="space-y-3">
              {holdings.map((item: PortfolioItem) => {
                const cur = prices[item.code]?.price ?? null
                const loading = prices[item.code]?.loading !== false
                const pnl = cur != null ? (cur - item.buyPrice) * item.shares * 1000 : null
                const pnlPct = cur != null ? (cur - item.buyPrice) / item.buyPrice * 100 : null
                const isUp = pnl != null && pnl >= 0
                return (
                  <div key={item.id} onClick={() => router.push(`/stock/${item.code}`)}
                    className="bg-gray-800 border border-gray-700 rounded-2xl p-4 cursor-pointer hover:border-gray-600 transition-colors">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <span className="font-mono text-blue-400 font-semibold mr-2">{item.code}</span>
                        <span className="text-gray-300 text-sm">{item.name}</span>
                      </div>
                      {loading ? <div className="h-5 w-16 bg-gray-700 rounded animate-pulse" /> : (
                        <div className="text-right">
                          <p className={`font-semibold ${isUp ? 'text-red-400' : 'text-green-400'}`}>{cur != null ? cur.toFixed(2) : '--'}</p>
                          {pnlPct != null && <p className={`text-xs ${isUp ? 'text-red-400' : 'text-green-400'}`}>{isUp ? '+' : ''}{pnlPct.toFixed(2)}%</p>}
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm mb-2">
                      <div><p className="text-xs text-gray-500">買進價</p><p className="text-gray-200">{item.buyPrice.toFixed(2)}</p></div>
                      <div><p className="text-xs text-gray-500">數量（張）</p><p className="text-gray-200">{item.shares}</p></div>
                      <div><p className="text-xs text-gray-500">買進日</p><p className="text-gray-200">{item.buyDate}</p></div>
                    </div>
                    {!loading && pnl != null && (
                      <p className={`text-sm font-medium mb-2 ${isUp ? 'text-red-400' : 'text-green-400'}`}>
                        浮動損益：{isUp ? '+' : ''}{(pnl / 10000).toFixed(2)} 萬
                      </p>
                    )}
                    <div className="pt-3 border-t border-gray-700 flex justify-end gap-1">
                      <button onClick={e => { e.stopPropagation(); setSellTarget({ item, price: prices[item.code]?.price ?? null }) }}
                        className="flex items-center gap-1 px-3 py-1.5 text-orange-400 hover:bg-gray-700 rounded-lg transition-colors text-xs font-medium">
                        賣出
                      </button>
                      <button onClick={e => { e.stopPropagation(); holdingRemove(item.id) }}
                        className="flex items-center gap-1 px-3 py-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-700 rounded-lg transition-colors text-xs">
                        <Trash2 size={13} />刪除
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )
      )}

      {/* ── Sold Tab ── */}
      {tab === 'sold' && (
        sortedSold.length === 0 ? (
          <div className="flex flex-col items-center gap-4 text-center py-16">
            <Receipt size={48} className="text-gray-600" />
            <p className="text-white text-lg font-semibold">尚無賣出紀錄</p>
            <p className="text-gray-400 text-sm">在持倉中點「賣出」，或手動新增</p>
            <button onClick={() => setAddSoldOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-xl transition-colors">
              <Plus size={15} />手動新增
            </button>
          </div>
        ) : (
          <>
            {/* Realized P&L summary */}
            <div className="bg-gray-800 border border-gray-700 rounded-2xl p-4 mb-4">
              <p className="text-xs text-gray-500 mb-1">總實現損益（含費）</p>
              <p className={`text-xl font-bold ${totalRealizedPnl >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                {totalRealizedPnl >= 0 ? '+' : ''}{(totalRealizedPnl / 10000).toFixed(2)} 萬
              </p>
              <p className="text-xs text-gray-500 mt-1">共 {soldList.length} 筆紀錄</p>
            </div>

            {/* Sold list */}
            <div className="space-y-3">
              {sortedSold.map((item: SoldItem) => {
                const netPnl = soldNetPnl(item)
                const hasFees = (item.buyFeeRate ?? 0) > 0 || (item.sellFeeRate ?? 0) > 0 || (item.taxRate ?? 0) > 0
                const pnlPct = netPnl / (item.buyPrice * item.shares * 1000 * (1 + (item.buyFeeRate ?? 0))) * 100
                const isUp = netPnl >= 0
                return (
                  <div key={item.id} onClick={() => router.push(`/stock/${item.code}`)}
                    className="bg-gray-800 border border-gray-700 rounded-2xl p-4 cursor-pointer hover:border-gray-600 transition-colors">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <span className="font-mono text-blue-400 font-semibold mr-2">{item.code}</span>
                        <span className="text-gray-300 text-sm">{item.name}</span>
                        <span className="ml-2 text-xs text-gray-600">{item.shares}張</span>
                      </div>
                      <div className={`text-right font-bold ${isUp ? 'text-red-400' : 'text-green-400'}`}>
                        {isUp ? '+' : ''}{(netPnl / 10000).toFixed(2)} 萬
                        <div className="text-xs font-normal">{isUp ? '+' : ''}{pnlPct.toFixed(1)}%</div>
                        {hasFees && <div className="text-xs font-normal text-gray-500">含費</div>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-400">
                      <div>買進 {item.buyDate} @ <span className="text-gray-300">{item.buyPrice}</span></div>
                      <div>賣出 {item.sellDate} @ <span className="text-gray-300">{item.sellPrice}</span></div>
                    </div>
                    {hasFees && (
                      <div className="mt-2 text-xs text-gray-600 flex gap-3">
                        <span>手續費 {((item.buyFeeRate ?? 0) * 100).toFixed(4)}%/{((item.sellFeeRate ?? 0) * 100).toFixed(4)}%</span>
                        <span>證交稅 {((item.taxRate ?? 0) * 100).toFixed(2)}%</span>
                      </div>
                    )}
                    <div className="mt-3 pt-3 border-t border-gray-700 flex justify-end">
                      <button onClick={e => { e.stopPropagation(); soldRemove(item.id) }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-700 rounded-lg transition-colors text-xs">
                        <Trash2 size={13} />刪除
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )
      )}

      {/* Modals */}
      {addOpen && <AddPortfolioModal onClose={() => setAddOpen(false)} />}
      {addSoldOpen && <AddSoldModal onClose={() => setAddSoldOpen(false)} />}
      {sellTarget && (
        <SellModal item={sellTarget.item} currentPrice={sellTarget.price}
          onConfirm={(d, p, bfr, sfr, tr) => handleSell(sellTarget.item, d, p, bfr, sfr, tr)}
          onClose={() => setSellTarget(null)} />
      )}
    </div>
  )
}
