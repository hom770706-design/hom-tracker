// TWSE Open API - no auth required

export async function getTWSEStockList(): Promise<{ code: string; name: string; industry: string }[]> {
  const res = await fetch('https://openapi.twse.com.tw/v1/opendata/t187ap03_L', {
    next: { revalidate: 86400 },
  })
  if (!res.ok) return []
  const data = await res.json()
  return data.map((item: Record<string, string>) => ({
    code: item['公司代號'] || item['股票代號'] || '',
    name: item['公司簡稱'] || item['公司名稱'] || '',
    industry: item['產業別'] || '',
  })).filter((s: { code: string }) => /^\d{4,6}$/.test(s.code))
}

// TPEX (上櫃) Open API
export async function getTPEXStockList(): Promise<{ code: string; name: string; industry: string }[]> {
  try {
    const res = await fetch('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_companies_summary', {
      next: { revalidate: 86400 },
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data as Record<string, string>[]).map(item => ({
      code: item['SecuritiesCompanyCode'] || item['股票代號'] || '',
      name: item['CompanyAbbr'] || item['公司簡稱'] || item['CompanyName'] || '',
      industry: item['IndustryGrouping'] || item['產業別'] || '',
    })).filter(s => /^\d{4,6}$/.test(s.code) && s.name)
  } catch {
    return []
  }
}

// Combined TSE + OTC + ETF list (cached per source, merged here)
export async function getAllStockList(): Promise<{ code: string; name: string; industry: string }[]> {
  const [twse, tpex] = await Promise.all([getTWSEStockList(), getTPEXStockList()])
  const map = new Map<string, { code: string; name: string; industry: string }>()
  tpex.forEach(s => { if (s.code) map.set(s.code, s) })
  twse.forEach(s => { if (s.code) map.set(s.code, s) }) // TSE wins on conflict
  return Array.from(map.values())
}

export async function getTWSEDayAll(): Promise<Record<string, { close: number; volume: number; change_pct: number }>> {
  try {
    const res = await fetch('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL', {
      next: { revalidate: 3600 },
    })
    if (!res.ok) return {}
    const data = await res.json()
    const result: Record<string, { close: number; volume: number; change_pct: number }> = {}
    for (const item of data) {
      const code = item['Code'] || item['股票代號']
      const closeStr = (item['ClosingPrice'] || item['收盤價'] || '').replace(/,/g, '')
      const volStr = (item['TradeVolume'] || item['成交股數'] || '').replace(/,/g, '')
      const changeStr = (item['Change'] || item['漲跌價差'] || '').replace(/,/g, '')
      const close = parseFloat(closeStr)
      const volume = parseInt(volStr, 10)
      const prevClose = close - parseFloat(changeStr || '0')
      const change_pct = prevClose > 0 ? ((close - prevClose) / prevClose) * 100 : 0
      if (code && !isNaN(close)) {
        result[code] = { close, volume: isNaN(volume) ? 0 : volume, change_pct }
      }
    }
    return result
  } catch {
    return {}
  }
}

export async function searchTWSEStock(query: string): Promise<{ code: string; name: string }[]> {
  const list = await getTWSEStockList()
  const q = query.toLowerCase()
  return list
    .filter(s => s.code.includes(q) || s.name.toLowerCase().includes(q))
    .slice(0, 10)
}
