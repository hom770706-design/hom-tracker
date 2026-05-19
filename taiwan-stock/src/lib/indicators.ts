import { OHLCVData, TechnicalIndicators } from './types'

function ema(data: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1)
  const result: (number | null)[] = []
  let prev: number | null = null
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null)
    } else if (i === period - 1) {
      const avg = data.slice(0, period).reduce((s, v) => s + v, 0) / period
      result.push(avg)
      prev = avg
    } else {
      const val: number = data[i] * k + prev! * (1 - k)
      result.push(val)
      prev = val
    }
  }
  return result
}

function sma(data: number[], period: number): (number | null)[] {
  return data.map((_, i) => {
    if (i < period - 1) return null
    return data.slice(i - period + 1, i + 1).reduce((s, v) => s + v, 0) / period
  })
}

function calculateKD(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 9
): { k: (number | null)[]; d: (number | null)[] } {
  const k: (number | null)[] = []
  const d: (number | null)[] = []
  let prevK = 50
  let prevD = 50

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      k.push(null)
      d.push(null)
      continue
    }
    const periodHighs = highs.slice(i - period + 1, i + 1)
    const periodLows = lows.slice(i - period + 1, i + 1)
    const highest = Math.max(...periodHighs)
    const lowest = Math.min(...periodLows)
    const rsv = highest === lowest ? 50 : ((closes[i] - lowest) / (highest - lowest)) * 100
    const kVal = (2 / 3) * prevK + (1 / 3) * rsv
    const dVal = (2 / 3) * prevD + (1 / 3) * kVal
    k.push(kVal)
    d.push(dVal)
    prevK = kVal
    prevD = dVal
  }
  return { k, d }
}

function calculateRSI(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = []
  const changes = closes.map((c, i) => (i === 0 ? 0 : c - closes[i - 1]))

  let avgGain = 0
  let avgLoss = 0

  for (let i = 0; i < closes.length; i++) {
    if (i < period) {
      result.push(null)
      if (i === period - 1) {
        const gains = changes.slice(1, period + 1).filter(c => c > 0)
        const losses = changes.slice(1, period + 1).filter(c => c < 0).map(c => Math.abs(c))
        avgGain = gains.reduce((s, v) => s + v, 0) / period
        avgLoss = losses.reduce((s, v) => s + v, 0) / period
      }
      continue
    }
    const change = changes[i]
    avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period
    avgLoss = (avgLoss * (period - 1) + (change < 0 ? Math.abs(change) : 0)) / period
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
    result.push(100 - 100 / (1 + rs))
  }
  return result
}

function calculateBollingerBands(
  closes: number[],
  period = 20,
  stdDev = 2
): { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] } {
  const middle = sma(closes, period)
  const upper: (number | null)[] = []
  const lower: (number | null)[] = []

  for (let i = 0; i < closes.length; i++) {
    if (middle[i] === null) {
      upper.push(null)
      lower.push(null)
      continue
    }
    const slice = closes.slice(i - period + 1, i + 1)
    const mean = middle[i]!
    const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period
    const sd = Math.sqrt(variance)
    upper.push(mean + stdDev * sd)
    lower.push(mean - stdDev * sd)
  }
  return { upper, middle, lower }
}

export function calculateAllIndicators(data: OHLCVData[]): TechnicalIndicators {
  const closes = data.map(d => d.close)
  const highs = data.map(d => d.high)
  const lows = data.map(d => d.low)

  const ma5 = sma(closes, 5)
  const ma20 = sma(closes, 20)
  const ma60 = sma(closes, 60)
  const ma120 = sma(closes, 120)

  const { k, d } = calculateKD(highs, lows, closes)

  const ema12 = ema(closes, 12)
  const ema26 = ema(closes, 26)
  const macd_dif = ema12.map((v, i) =>
    v !== null && ema26[i] !== null ? v - ema26[i]! : null
  )
  const nonNullDif = macd_dif.map(v => v ?? 0)
  const rawDea = ema(nonNullDif, 9)
  const macd_dea = macd_dif.map((v, i) => (v !== null ? rawDea[i] : null))
  const macd_hist = macd_dif.map((v, i) =>
    v !== null && macd_dea[i] !== null ? 2 * (v - macd_dea[i]!) : null
  )

  const rsi14 = calculateRSI(closes)
  const bb = calculateBollingerBands(closes)

  return {
    ma5, ma20, ma60, ma120,
    k, d,
    macd_dif, macd_dea, macd_hist,
    rsi14,
    bb_upper: bb.upper,
    bb_middle: bb.middle,
    bb_lower: bb.lower,
  }
}

export function checkMACrossover(
  ma_fast: (number | null)[],
  ma_slow: (number | null)[],
  type: 'golden' | 'death'
): boolean {
  const len = ma_fast.length
  if (len < 2) return false
  const prev_fast = ma_fast[len - 2]
  const curr_fast = ma_fast[len - 1]
  const prev_slow = ma_slow[len - 2]
  const curr_slow = ma_slow[len - 1]
  if (prev_fast === null || curr_fast === null || prev_slow === null || curr_slow === null) return false
  if (type === 'golden') return prev_fast <= prev_slow && curr_fast > curr_slow
  return prev_fast >= prev_slow && curr_fast < curr_slow
}

export function checkKDCrossover(k: (number | null)[], d: (number | null)[], type: 'golden' | 'death'): boolean {
  const len = k.length
  if (len < 2) return false
  const pk = k[len - 2]; const ck = k[len - 1]
  const pd = d[len - 2]; const cd = d[len - 1]
  if (pk === null || ck === null || pd === null || cd === null) return false
  if (type === 'golden') return pk <= pd && ck > cd && ck < 50
  return pk >= pd && ck < cd && ck > 50
}
