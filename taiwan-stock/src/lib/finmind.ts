const BASE_URL = 'https://api.finmindtrade.com/api/v4/data'

async function fetchFinMind(dataset: string, params: Record<string, string>, revalidate = 3600) {
  const token = process.env.FINMIND_TOKEN
  const query = new URLSearchParams({ dataset, ...params })
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
  const res = await fetch(`${BASE_URL}?${query}`, {
    headers,
    next: { revalidate },
  })
  if (!res.ok) throw new Error(`FinMind API error: ${res.status}`)
  const json = await res.json()
  if (json.status !== 200) throw new Error(json.msg || 'FinMind error')
  return json.data
}

export async function getStockPrice(stockId: string, startDate: string) {
  return fetchFinMind('TaiwanStockPrice', { data_id: stockId, start_date: startDate }, 900)
}

export async function getInstitutionalInvestors(stockId: string, startDate: string) {
  return fetchFinMind('TaiwanStockInstitutionalInvestorsBuySell', { data_id: stockId, start_date: startDate })
}

export async function getFinancialStatement(stockId: string) {
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 2)
  const startDate = oneYearAgo.toISOString().split('T')[0]
  return fetchFinMind('TaiwanStockFinancialStatements', { data_id: stockId, start_date: startDate })
}

export async function getStockPER(stockId: string, startDate: string) {
  return fetchFinMind('TaiwanStockPER', { data_id: stockId, start_date: startDate })
}

export async function getMonthRevenue(stockId: string) {
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 2)
  const startDate = oneYearAgo.toISOString().split('T')[0]
  return fetchFinMind('TaiwanStockMonthRevenue', { data_id: stockId, start_date: startDate })
}

export async function getStockInfo(stockId: string) {
  return fetchFinMind('TaiwanStockInfo', { data_id: stockId })
}
