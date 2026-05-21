'use client'

import { useState, useEffect } from 'react'

export interface WatchlistItem { code: string; name: string }
export interface PortfolioItem { id: string; code: string; name: string; buyDate: string; buyPrice: number; shares: number }
export interface SoldItem { id: string; code: string; name: string; buyDate: string; buyPrice: number; shares: number; sellDate: string; sellPrice: number }

const WL_KEY = 'watchlist'
const PT_KEY = 'portfolio'
const SOLD_KEY = 'sold_records'
const WL_EVENT = 'watchlist_changed'
const PT_EVENT = 'portfolio_changed'
const SOLD_EVENT = 'sold_changed'

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

export function useSold() {
  const [list, setList] = useState<SoldItem[]>([])
  useEffect(() => {
    setList(readList<SoldItem>(SOLD_KEY))
    const handle = () => setList(readList<SoldItem>(SOLD_KEY))
    window.addEventListener(SOLD_EVENT, handle)
    return () => window.removeEventListener(SOLD_EVENT, handle)
  }, [])
  const add = (item: Omit<SoldItem, 'id'>) => {
    const next = [...readList<SoldItem>(SOLD_KEY), { ...item, id: String(Date.now()) }]
    saveList(SOLD_KEY, SOLD_EVENT, next)
    setList(next)
  }
  const remove = (id: string) => {
    const next = readList<SoldItem>(SOLD_KEY).filter(i => i.id !== id)
    saveList(SOLD_KEY, SOLD_EVENT, next)
    setList(next)
  }
  return { list, add, remove }
}
