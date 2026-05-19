'use client'

import { useState, useEffect } from 'react'

export interface WatchlistItem { code: string; name: string }
export interface PortfolioItem { id: string; code: string; name: string; buyDate: string; buyPrice: number; shares: number }

const WL_KEY = 'watchlist'
const PT_KEY = 'portfolio'
const WL_EVENT = 'watchlist_changed'
const PT_EVENT = 'portfolio_changed'

function readList<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') ?? [] } catch { return [] }
}

function saveList<T>(key: string, event: string, next: T[]) {
  localStorage.setItem(key, JSON.stringify(next))
  window.dispatchEvent(new Event(event))
}

export function useWatchlist() {
  const [list, setList] = useState<WatchlistItem[]>([])
  useEffect(() => {
    setList(readList<WatchlistItem>(WL_KEY))
    const handle = () => setList(readList<WatchlistItem>(WL_KEY))
    window.addEventListener(WL_EVENT, handle)
    return () => window.removeEventListener(WL_EVENT, handle)
  }, [])
  const toggle = (item: WatchlistItem) => {
    const cur = readList<WatchlistItem>(WL_KEY)
    const next = cur.some(i => i.code === item.code) ? cur.filter(i => i.code !== item.code) : [...cur, item]
    saveList(WL_KEY, WL_EVENT, next)
    setList(next)
  }
  const remove = (code: string) => {
    const next = readList<WatchlistItem>(WL_KEY).filter(i => i.code !== code)
    saveList(WL_KEY, WL_EVENT, next)
    setList(next)
  }
  const has = (code: string) => list.some(i => i.code === code)
  return { list, toggle, remove, has }
}

export function usePortfolio() {
  const [list, setList] = useState<PortfolioItem[]>([])
  useEffect(() => {
    setList(readList<PortfolioItem>(PT_KEY))
    const handle = () => setList(readList<PortfolioItem>(PT_KEY))
    window.addEventListener(PT_EVENT, handle)
    return () => window.removeEventListener(PT_EVENT, handle)
  }, [])
  const add = (item: Omit<PortfolioItem, 'id'>) => {
    const next = [...readList<PortfolioItem>(PT_KEY), { ...item, id: String(Date.now()) }]
    saveList(PT_KEY, PT_EVENT, next)
    setList(next)
  }
  const remove = (id: string) => {
    const next = readList<PortfolioItem>(PT_KEY).filter(i => i.id !== id)
    saveList(PT_KEY, PT_EVENT, next)
    setList(next)
  }
  return { list, add, remove }
}
