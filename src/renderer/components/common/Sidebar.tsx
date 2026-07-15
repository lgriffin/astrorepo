import React from 'react'
import { NavLink } from 'react-router-dom'

interface NavItem {
  to: string
  label: string
  icon: string
}

const navItems: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: '◉' },
  { to: '/targets', label: 'Targets', icon: '★' },
  { to: '/sessions/new', label: 'New Session', icon: '+' },
  { to: '/collections', label: 'Collections', icon: '▦' },
  { to: '/equipment', label: 'Equipment', icon: '⚙' },
  { to: '/observatory', label: 'Observatory', icon: '◎' },
  { to: '/planning', label: 'Planning', icon: '☽' },
  { to: '/poster', label: 'Posters', icon: '▣' },
  { to: '/settings', label: 'Settings', icon: '⚒' }
]

export function Sidebar(): React.ReactElement {
  return (
    <aside className="w-56 bg-astro-surface border-r border-astro-border flex flex-col shrink-0">
      <div className="p-4 border-b border-astro-border">
        <h1 className="text-lg font-bold text-astro-accent tracking-wide">AstroRepo</h1>
      </div>
      <nav className="flex-1 py-2 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                isActive
                  ? 'bg-astro-accent/10 text-astro-accent border-r-2 border-astro-accent'
                  : 'text-astro-muted hover:text-astro-text hover:bg-astro-bg/50'
              }`
            }
          >
            <span className="text-base w-5 text-center">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
