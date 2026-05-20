import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code') || '6175'

  const results: Record<string, unknown> = {}

  // Test TWSE
  try {
    const res = await fetch('https://openapi.twse.com.tw/v1/opendata/t187ap03_L')
    const data = await res.json()
    const found = data.find((i: Record<string, string>) =>
      (i['公司代號'] || i['股票代號']) === code
    )
    results.twse_found = found ?? null
    results.twse_sample = data.slice(0, 2)
    results.twse_total = data.length
  } catch (e) {
    results.twse_error = String(e)
  }

  // Test TPEX
  try {
    const res = await fetch('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_companies_summary')
    const data = await res.json()
    const found = data.find((i: Record<string, string>) =>
      Object.values(i).includes(code)
    )
    results.tpex_found = found ?? null
    results.tpex_sample = data.slice(0, 2)
    results.tpex_total = data.length
  } catch (e) {
    results.tpex_error = String(e)
  }

  // Test FinMind TaiwanStockInfo
  try {
    const token = process.env.FINMIND_TOKEN
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
    const res = await fetch(
      `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockInfo&data_id=${code}`,
      { headers }
    )
    const json = await res.json()
    results.finmind_status = json.status
    results.finmind_data = json.data?.slice(0, 2) ?? null
    results.finmind_msg = json.msg
  } catch (e) {
    results.finmind_error = String(e)
  }

  return NextResponse.json(results, { headers: { 'Cache-Control': 'no-store' } })
}
