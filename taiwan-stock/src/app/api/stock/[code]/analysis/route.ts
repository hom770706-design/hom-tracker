import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  const apiKey = process.env.GROK_API_KEY
  if (!apiKey) return NextResponse.json({ error: '未設定 GROK_API_KEY' }, { status: 400 })

  try {
    const body = await req.json()
    const { stockName, price, changePct, indicators, institutional } = body

    const prompt = buildPrompt(code, stockName, price, changePct, indicators, institutional)

    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'grok-3-mini',
        messages: [
          {
            role: 'system',
            content: '你是一位專業的台股技術分析師，擅長解讀技術指標和籌碼資料。請用繁體中文回答，語氣專業但易懂。',
          },
          { role: 'user', content: prompt },
        ],
        max_tokens: 800,
        temperature: 0.3,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Grok API error ${res.status}: ${err}`)
    }

    const json = await res.json()
    const content = json.choices?.[0]?.message?.content ?? '分析失敗'
    return NextResponse.json({ analysis: content })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

function buildPrompt(
  code: string,
  name: string,
  price: number,
  changePct: number,
  ind: Record<string, number | null>,
  inst: Record<string, number> | null
) {
  const direction = changePct >= 0 ? `上漲 ${changePct.toFixed(2)}%` : `下跌 ${Math.abs(changePct).toFixed(2)}%`

  const maStatus = (() => {
    const { ma5, ma20, ma60 } = ind
    if (ma5 == null || ma20 == null || ma60 == null) return '均線資料不足'
    if (ma5 > ma20 && ma20 > ma60) return '多頭排列（MA5 > MA20 > MA60）'
    if (ma5 < ma20 && ma20 < ma60) return '空頭排列（MA5 < MA20 < MA60）'
    return '均線糾結整理中'
  })()

  const kdStatus = (() => {
    const { k, d } = ind
    if (k == null || d == null) return 'KD 資料不足'
    const zone = k < 20 ? '超賣區' : k > 80 ? '超買區' : '中性區'
    const cross = k > d ? 'K 在 D 上方（偏多）' : 'K 在 D 下方（偏空）'
    return `K=${k.toFixed(1)} D=${d.toFixed(1)}，位於${zone}，${cross}`
  })()

  const macdStatus = (() => {
    const { macd_dif, macd_dea, macd_hist } = ind
    if (macd_dif == null || macd_dea == null) return 'MACD 資料不足'
    const pos = macd_dif > 0 ? '零軸以上' : '零軸以下'
    const cross = macd_dif > macd_dea ? 'DIF 在 DEA 上方（金叉偏多）' : 'DIF 在 DEA 下方（死叉偏空）'
    const hist = macd_hist != null ? `柱狀：${macd_hist > 0 ? '正（動能增強）' : '負（動能減弱）'}` : ''
    return `${pos}，${cross}，${hist}`
  })()

  const instStatus = inst
    ? `外資 ${inst.foreign_net > 0 ? '買超' : '賣超'} ${Math.abs(inst.foreign_net / 1000).toFixed(0)} 張，` +
      `投信 ${inst.trust_net > 0 ? '買超' : '賣超'} ${Math.abs(inst.trust_net / 1000).toFixed(0)} 張，` +
      `三大法人合計 ${inst.total_net > 0 ? '買超' : '賣超'} ${Math.abs(inst.total_net / 1000).toFixed(0)} 張`
    : '籌碼資料不足'

  return `請分析以下台股資料，給出技術面與籌碼面的綜合判斷：

**股票：${code} ${name}**
**收盤價：${price} 元（${direction}）**

【技術指標】
- 均線：${maStatus}
- KD 指標：${kdStatus}
- MACD：${macdStatus}

【三大法人（昨日）】
${instStatus}

請：
1. 綜合判斷目前趨勢（多方/空方/盤整）
2. 點出最關鍵的信號（1-2 個）
3. 短線操作建議（持有/觀望/注意風險）
4. 風險提示

回答請控制在 300 字以內。`
}
