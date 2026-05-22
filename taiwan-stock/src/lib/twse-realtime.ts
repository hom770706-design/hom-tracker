export interface RealtimeQuote {
  date: string       // YYYY-MM-DD (Taiwan time)
  close: number
  open: number | null
  high: number | null
  low: number | null
  isLive: boolean    // true = active trade price (z field); false = using prev close (y field)
}

export async function getRealtimeQuote(code: string): Promise<RealtimeQuote | null> {
  for (const ex of ['tse', 'otc']) {
    try {
      const res = await fetch(
        `https://mis.twse.com.tw/stock/api/getStockInfo.asp?ex_ch=${ex}_${code}.tw&json=1&delay=0`,
        { cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0' } }
      )
      if (!res.ok) continue
      const json = await res.json()
      const item = json.msgArray?.[0]
      if (!item || !item.d || item.d.length !== 8) continue

      const z = item.z  // latest trade price, or '-'
      const y = item.y  // yesterday's close
      const isLive = z && z !== '-'
      const rawPrice = isLive ? z : (y && y !== '-' ? y : null)
      if (!rawPrice) continue

      const price = parseFloat(rawPrice)
      if (isNaN(price) || price <= 0) continue

      const d = item.d
      return {
        date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
        close: price,
        open: (item.o && item.o !== '-') ? parseFloat(item.o) : null,
        high: (item.h && item.h !== '-') ? parseFloat(item.h) : null,
        low: (item.l && item.l !== '-') ? parseFloat(item.l) : null,
        isLive: Boolean(isLive),
      }
    } catch { /* try next exchange */ }
  }
  return null
}
