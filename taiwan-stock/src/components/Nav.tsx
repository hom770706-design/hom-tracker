'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Search, ScanLine } from 'lucide-react'

const links = [
  { href: '/', label: '首頁', icon: Home },
  { href: '/stock/2330', label: '個股', icon: Search },
  { href: '/scanner', label: '掃股', icon: ScanLine },
]

export default function Nav() {
  const path = usePathname()
  return (
    <>
      {/* Desktop top nav */}
      <header className="hidden md:flex items-center justify-between px-6 py-3 border-b border-gray-800 bg-gray-900">
        <Link href="/" className="text-white font-bold text-lg tracking-tight">📈 台股分析</Link>
        <nav className="flex gap-1">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                path === href || (href !== '/' && path.startsWith(href.split('/').slice(0, 2).join('/')))
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-gray-900 border-t border-gray-800 flex">
        {links.map(({ href, label, icon: Icon }) => {
          const active = path === href || (href !== '/' && path.startsWith(href.split('/').slice(0, 2).join('/')))
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors ${
                active ? 'text-blue-400' : 'text-gray-500'
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 1.5} />
              {label}
            </Link>
          )
        })}
      </nav>
    </>
  )
}
