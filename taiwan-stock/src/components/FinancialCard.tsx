interface FinData {
  pe_ratio: number | null
  pb_ratio: number | null
  dividend_yield: number | null
  eps: number | null
  roe: number | null
  revenue_yoy: number | null
}

function Row({ label, value, unit = '', positive = true }: { label: string; value: number | null; unit?: string; positive?: boolean }) {
  if (value === null) return (
    <div className="flex justify-between py-2 border-b border-gray-800">
      <span className="text-gray-400 text-sm">{label}</span>
      <span className="text-gray-600 text-sm">N/A</span>
    </div>
  )
  const colored = positive ? (value >= 0 ? 'text-red-400' : 'text-green-400') : 'text-white'
  return (
    <div className="flex justify-between py-2 border-b border-gray-800">
      <span className="text-gray-400 text-sm">{label}</span>
      <span className={`text-sm font-semibold ${colored}`}>{value.toFixed(2)}{unit}</span>
    </div>
  )
}

export default function FinancialCard({ data }: { data: FinData }) {
  return (
    <div className="space-y-0">
      <Row label="本益比 (PE)" value={data.pe_ratio} unit="x" positive={false} />
      <Row label="股價淨值比 (PB)" value={data.pb_ratio} unit="x" positive={false} />
      <Row label="殖利率" value={data.dividend_yield} unit="%" positive={false} />
      <Row label="每股盈餘 (EPS)" value={data.eps} unit=" 元" />
      <Row label="股東權益報酬率 (ROE)" value={data.roe} unit="%" />
      <Row label="月營收年增率" value={data.revenue_yoy} unit="%" />
    </div>
  )
}
