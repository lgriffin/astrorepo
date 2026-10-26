import React, { useEffect, useState } from 'react'
import { opensPalette } from '@shared/command-palette'
import { Sidebar } from './Sidebar'
import { CommandPalette } from './CommandPalette'

interface LayoutProps {
  children: React.ReactNode
}

export function Layout({ children }: LayoutProps): React.ReactElement {
  const [palette, setPalette] = useState(false)

  // Ctrl+K (Cmd+K on a Mac) opens the palette from anywhere, and closes it again (LF-013).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!opensPalette(e)) return
      e.preventDefault()
      setPalette(open => !open)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-screen bg-astro-bg text-astro-text overflow-hidden">
      <Sidebar onSearch={() => setPalette(true)} />
      <main id="main" tabIndex={-1} className="flex-1 overflow-y-auto focus:outline-none focus-visible:outline-none">{children}</main>
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
    </div>
  )
}
