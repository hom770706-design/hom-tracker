export interface OHLCVData {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface StockInfo {
  code: string
  name: string
  industry?: string
  market?: string
}

export interface InstitutionalData {
  date: string
  foreign_buy: number
  foreign_sell: number
  foreign_net: number
  trust_buy: number
  trust_sell: number
  trust_net: number
  dealer_buy: number
  dealer_sell: number
  dealer_net: number
  total_net: number
}

export interface FinancialData {
  eps: number | null
  pe_ratio: number | null
  pb_ratio: number | null
  roe: number | null
  revenue_yoy: number | null
  operating_margin: number | null
}

export interface TechnicalIndicators {
  ma5: (number | null)[]
  ma20: (number | null)[]
  ma60: (number | null)[]
  ma120: (number | null)[]
  k: (number | null)[]
  d: (number | null)[]
  macd_dif: (number | null)[]
  macd_dea: (number | null)[]
  macd_hist: (number | null)[]
  rsi14: (number | null)[]
  bb_upper: (number | null)[]
  bb_middle: (number | null)[]
  bb_lower: (number | null)[]
}

export type ScanConditionOperator = 'AND' | 'OR'

export interface ScanCondition {
  id: string
  category: string
  indicator: string
  label: string
  enabled: boolean
  params?: Record<string, number>
}

export interface ScanResult {
  code: string
  name: string
  close: number
  change_pct: number
  volume: number
  matched_conditions: string[]
}

export interface ScanGroup {
  operator: ScanConditionOperator
  conditions: ScanCondition[]
}
