'use client'

import { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp, Zap } from 'lucide-react'
import { ScanCondition, ScanConditionOperator, ScanGroup } from '@/lib/types'

const ALL_CONDITIONS: (Omit<ScanCondition, 'id' | 'enabled'> & { defaultEnabled?: boolean })[] = [
  // 均線
  { category: '均線趨勢', indicator: 'ma_bullish', label: '均線多頭排列 (MA5>MA20>MA60)' },
  { category: '均線趨勢', indicator: 'price_above_ma20', label: '股價站上20日均線' },
  { category: '均線趨勢', indicator: 'price_above_ma60', label: '股價站上60日均線' },
  { category: '均線趨勢', indicator: 'ma5_golden_ma20', label: 'MA5 黃金交叉 MA20', defaultEnabled: true },
  { category: '均線趨勢', indicator: 'ma5_death_ma20', label: 'MA5 死亡交叉 MA20' },
  // KD
  { category: 'KD 指標', indicator: 'kd_golden_low', label: 'KD 低檔黃金交叉 (K<50)', defaultEnabled: true },
  { category: 'KD 指標', indicator: 'kd_death_high', label: 'KD 高檔死亡交叉 (K>50)' },
  { category: 'KD 指標', indicator: 'k_oversold', label: 'K 值超賣 (K < 20)' },
  { category: 'KD 指標', indicator: 'k_overbought', label: 'K 值超買 (K > 80)' },
  // MACD
  { category: 'MACD', indicator: 'macd_golden', label: 'MACD 黃金交叉 (DIF上穿DEA)' },
  { category: 'MACD', indicator: 'macd_hist_positive', label: 'MACD 柱狀圖由負轉正' },
  { category: 'MACD', indicator: 'macd_above_zero', label: 'DIF 在零軸以上' },
  // RSI
  { category: 'RSI', indicator: 'rsi_oversold', label: 'RSI 超賣反彈 (RSI < 30)' },
  { category: 'RSI', indicator: 'rsi_overbought', label: 'RSI 超買 (RSI > 70)' },
  // 量能
  { category: '量能', indicator: 'volume_breakout', label: '爆量 (成交量 > 20日均量2倍)' },
  { category: '量能', indicator: 'volume_price_up', label: '量增價漲' },
  { category: '量能', indicator: 'volume_shrink', label: '量縮整理' },
  // 三大法人
  { category: '三大法人', indicator: 'foreign_buy_consecutive', label: '外資當日買超' },
  { category: '三大法人', indicator: 'trust_buy_consecutive', label: '投信當日買超' },
  { category: '三大法人', indicator: 'institutional_all_buy', label: '三大法人合計買超' },
  // 突破
  { category: '突破', indicator: 'bb_lower_bounce', label: '布林通道下軌反彈' },
  { category: '突破', indicator: 'new_high_n', label: '創20日新高' },
]

const CATEGORIES = [...new Set(ALL_CONDITIONS.map(c => c.category))]

function newGroup(op: ScanConditionOperator = 'AND'): ScanGroup {
  return {
    operator: op,
    conditions: ALL_CONDITIONS.map((c, i) => ({
      id: `${c.indicator}-${Date.now()}-${i}`,
      category: c.category,
      indicator: c.indicator,
      label: c.label,
      enabled: c.defaultEnabled ?? false,
    })),
  }
}

interface Props {
  onScan: (groups: ScanGroup[], globalOperator: ScanConditionOperator) => void
  loading: boolean
}

export default function ScannerBuilder({ onScan, loading }: Props) {
  const [groups, setGroups] = useState<ScanGroup[]>([newGroup('AND')])
  const [globalOperator, setGlobalOperator] = useState<ScanConditionOperator>('AND')
  const [collapsed, setCollapsed] = useState<boolean[]>([false])

  const addGroup = () => {
    setGroups(prev => [...prev, newGroup('AND')])
    setCollapsed(prev => [...prev, false])
  }

  const removeGroup = (idx: number) => {
    setGroups(prev => prev.filter((_, i) => i !== idx))
    setCollapsed(prev => prev.filter((_, i) => i !== idx))
  }

  const toggleCondition = (groupIdx: number, condId: string) => {
    setGroups(prev => prev.map((g, gi) =>
      gi !== groupIdx ? g : {
        ...g,
        conditions: g.conditions.map(c => c.id === condId ? { ...c, enabled: !c.enabled } : c),
      }
    ))
  }

  const setGroupOp = (groupIdx: number, op: ScanConditionOperator) => {
    setGroups(prev => prev.map((g, gi) => gi !== groupIdx ? g : { ...g, operator: op }))
  }

  const toggleCollapse = (idx: number) => {
    setCollapsed(prev => prev.map((c, i) => i === idx ? !c : c))
  }

  const enabledCount = groups.flatMap(g => g.conditions).filter(c => c.enabled).length

  return (
    <div className="space-y-4">
      {groups.length > 1 && (
        <div className="flex items-center gap-3 p-3 bg-gray-800 rounded-xl">
          <span className="text-gray-400 text-sm">條件群組之間：</span>
          <div className="flex gap-2">
            {(['AND', 'OR'] as ScanConditionOperator[]).map(op => (
              <button
                key={op}
                onClick={() => setGlobalOperator(op)}
                className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-colors ${
                  globalOperator === op ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                {op === 'AND' ? '全部符合 AND' : '任一符合 OR'}
              </button>
            ))}
          </div>
        </div>
      )}

      {groups.map((group, gi) => {
        const catMap: Record<string, ScanCondition[]> = {}
        for (const c of group.conditions) {
          if (!catMap[c.category]) catMap[c.category] = []
          catMap[c.category].push(c)
        }
        const groupEnabled = group.conditions.filter(c => c.enabled).length
        return (
          <div key={gi} className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <div className="flex items-center gap-3">
                <span className="text-white font-semibold text-sm">
                  條件群組 {gi + 1}
                  {groupEnabled > 0 && <span className="ml-2 bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">{groupEnabled}</span>}
                </span>
                <div className="flex gap-1">
                  {(['AND', 'OR'] as ScanConditionOperator[]).map(op => (
                    <button
                      key={op}
                      onClick={() => setGroupOp(gi, op)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                        group.operator === op ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                      }`}
                    >
                      {op}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {groups.length > 1 && (
                  <button onClick={() => removeGroup(gi)} className="text-gray-500 hover:text-red-400 transition-colors p-1">
                    <Trash2 size={14} />
                  </button>
                )}
                <button onClick={() => toggleCollapse(gi)} className="text-gray-500 hover:text-white transition-colors p-1">
                  {collapsed[gi] ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                </button>
              </div>
            </div>

            {!collapsed[gi] && (
              <div className="p-4 space-y-4">
                {CATEGORIES.map(cat => (
                  <div key={cat}>
                    <div className="text-xs text-gray-500 font-medium mb-2 uppercase tracking-wide">{cat}</div>
                    <div className="space-y-1">
                      {catMap[cat]?.map(cond => (
                        <label key={cond.id} className="flex items-center gap-3 cursor-pointer group py-1">
                          <div
                            onClick={() => toggleCondition(gi, cond.id)}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                              cond.enabled
                                ? 'bg-blue-600 border-blue-600'
                                : 'border-gray-600 group-hover:border-gray-400'
                            }`}
                          >
                            {cond.enabled && <div className="w-2.5 h-2.5 bg-white rounded-sm" />}
                          </div>
                          <span
                            onClick={() => toggleCondition(gi, cond.id)}
                            className={`text-sm transition-colors ${cond.enabled ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'}`}
                          >
                            {cond.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      <div className="flex gap-3">
        <button
          onClick={addGroup}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-xl text-sm transition-colors"
        >
          <Plus size={16} />
          新增條件群組
        </button>
        <button
          onClick={() => onScan(groups, globalOperator)}
          disabled={loading || enabledCount === 0}
          className="flex-1 flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition-colors"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Zap size={16} />
          )}
          {loading ? '掃描中...' : `開始掃股 (${enabledCount} 個條件)`}
        </button>
      </div>
    </div>
  )
}
