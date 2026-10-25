import React, { useState } from 'react'
import type { ThemeChoice, ThemeName } from '@shared/appearance'
import { PALETTES } from '@shared/themes'
import { Card } from '../common/Card'
import { useTheme } from '../../contexts/ThemeContext'

const CHOICES: { id: ThemeChoice; label: string; hint: string }[] = [
  { id: 'system', label: 'Match this computer', hint: 'Light or dark, as Windows or the browser is set' },
  { id: 'dark', label: 'Dark', hint: 'For the evening and the processing desk' },
  { id: 'light', label: 'Light', hint: 'For daylight' },
  { id: 'night', label: 'Night', hint: 'Red only, to keep your eyes dark-adapted at the scope' }
]

/** A small picture of a theme: its ground, a surface, text and the accent. */
function Swatch({ theme }: { theme: ThemeName }): React.ReactElement {
  const p = PALETTES[theme]
  return (
    <span aria-hidden className="flex h-10 w-16 shrink-0 flex-col justify-center gap-1 rounded border px-1.5" style={{ background: p.bg, borderColor: p.border }}>
      <span className="h-1.5 w-10 rounded-sm" style={{ background: p.text }} />
      <span className="h-1.5 w-7 rounded-sm" style={{ background: p.muted }} />
      <span className="h-1.5 w-5 rounded-sm" style={{ background: p.accent }} />
    </span>
  )
}

/** Settings → Appearance (LF-002): the theme, saved for this installation, applied at once. */
export function AppearanceSettings(): React.ReactElement {
  const { choice, theme, choose } = useTheme()
  const [failed, setFailed] = useState(false)

  const pick = async (next: ThemeChoice): Promise<void> => {
    setFailed(!(await choose(next)))
  }

  return (
    <Card title="Appearance">
      <div role="radiogroup" aria-label="Theme" className="grid gap-2 sm:grid-cols-2">
        {CHOICES.map(c => {
          const selected = c.id === choice
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => void pick(c.id)}
              className={`flex items-center gap-3 rounded-md border p-2 text-left transition-colors ${
                selected ? 'border-astro-accent bg-astro-accent/10' : 'border-astro-border hover:border-astro-muted'
              }`}
            >
              <Swatch theme={c.id === 'system' ? theme : c.id} />
              <span>
                <span className="block text-sm text-astro-text">{c.label}</span>
                <span className="block text-xs text-astro-muted">{c.hint}</span>
              </span>
            </button>
          )
        })}
      </div>
      {failed && <p className="mt-2 text-xs text-astro-danger">The theme is shown on this screen but could not be saved. It will go back after a restart.</p>}
    </Card>
  )
}
