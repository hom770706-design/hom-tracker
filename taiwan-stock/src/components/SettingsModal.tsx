'use client'

import { useState, useEffect } from 'react'
import { Settings, X, Eye, EyeOff, Check } from 'lucide-react'

const STORAGE_KEY = 'grok_api_key'

export function useGrokKey() {
  const [key, setKey] = useState<string>('')
  useEffect(() => {
    setKey(localStorage.getItem(STORAGE_KEY) ?? '')
  }, [])
  const save = (k: string) => {
    localStorage.setItem(STORAGE_KEY, k)
    setKey(k)
  }
  return { key, save }
}

export default function SettingsModal() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [show, setShow] = useState(false)
  const [saved, setSaved] = useState(false)
  const { key, save } = useGrokKey()

  useEffect(() => {
    if (open) setInput(key)
  }, [open, key])

  const handleSave = () => {
    save(input.trim())
    setSaved(true)
    setTimeout(() => { setSaved(false); setOpen(false) }, 1000)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
        title="設定"
      >
        <Settings size={18} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-semibold">API 設定</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white p-1">
                <X size={18} />
              </button>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Grok API Key
                <span className="ml-2 text-xs text-gray-600">（AI 分析功能需要）</span>
              </label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    type={show ? 'text' : 'password'}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder="gsk_..."
                    className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-blue-500 pr-10"
                  />
                  <button
                    onClick={() => setShow(!show)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    {show ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                免費申請：console.x.ai → API Keys → Create API Key
              </p>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-xl text-sm transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {saved ? <><Check size={14} />已儲存</> : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
