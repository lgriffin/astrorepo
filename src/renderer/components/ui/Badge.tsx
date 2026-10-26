import React from 'react'
import type { Token } from '@shared/themes'

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | Extract<Token, `cat-${number}`>

const TONE: Record<BadgeTone, string> = {
  neutral: 'bg-astro-raised text-astro-muted',
  accent: 'bg-astro-accent/15 text-astro-accent',
  success: 'bg-astro-success/15 text-astro-success',
  warning: 'bg-astro-warning/15 text-astro-warning',
  danger: 'bg-astro-danger/15 text-astro-danger',
  info: 'bg-astro-info/15 text-astro-info',
  'cat-1': 'bg-astro-cat-1/15 text-astro-cat-1',
  'cat-2': 'bg-astro-cat-2/15 text-astro-cat-2',
  'cat-3': 'bg-astro-cat-3/15 text-astro-cat-3',
  'cat-4': 'bg-astro-cat-4/15 text-astro-cat-4',
  'cat-5': 'bg-astro-cat-5/15 text-astro-cat-5',
  'cat-6': 'bg-astro-cat-6/15 text-astro-cat-6',
  'cat-7': 'bg-astro-cat-7/15 text-astro-cat-7',
  'cat-8': 'bg-astro-cat-8/15 text-astro-cat-8'
}

/** A short status or kind beside a name: the words carry the meaning, the tone only helps (LF-006). */
export function Badge({ tone = 'neutral', className = '', children }: { tone?: BadgeTone; className?: string; children: React.ReactNode }): React.ReactElement {
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONE[tone]} ${className}`}>{children}</span>
}
