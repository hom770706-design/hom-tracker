'use client'

import { InstitutionalData } from '@/lib/types'

interface Props {
  data: InstitutionalData[]
}

function fmt(n: number) {
  if (n === 0) return <span className="text-gray-500">-</span>
  const abs = Math.abs(n / 1000).toFixed(0)
  return <span className={n > 0 ? 'text-red-400' : 'text-green-400'}>{n > 0 ? '+' : ''}{parseInt(abs).toLocaleString()}張</span>
}

export default function InstitutionalTable({ data }: Props) {
  const recent = data.slice(0, 10)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-700">
            <th className="text-left py-2 px-2 text-gray-400 font-medium">日期</th>
            <th className="text-right py-2 px-2 text-gray-400 font-medium">外資</th>
            <th className="text-right py-2 px-2 text-gray-400 font-medium">投信</th>
            <th className="text-right py-2 px-2 text-gray-400 font-medium">自營商</th>
            <th className="text-right py-2 px-2 text-gray-400 font-medium">合計</th>
          </tr>
        </thead>
        <tbody>
          {recent.map(row => (
            <tr key={row.date} className="border-b border-gray-800 hover:bg-gray-800/50">
              <td className="py-2 px-2 text-gray-300">{row.date.slice(5)}</td>
              <td className="py-2 px-2 text-right">{fmt(row.foreign_net)}</td>
              <td className="py-2 px-2 text-right">{fmt(row.trust_net)}</td>
              <td className="py-2 px-2 text-right">{fmt(row.dealer_net)}</td>
              <td className="py-2 px-2 text-right font-semibold">{fmt(row.total_net)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
