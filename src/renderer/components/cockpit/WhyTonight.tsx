import React, { useEffect, useState } from 'react'
import type { TonightSkyView } from '@shared/types'
import { invoke } from '../../hooks/useIPC'
import { useLearning } from '../../contexts/LearningContext'
import { Explain } from '../ui'

/** The site and night that tonight's darkness is worked out for. */
export interface TonightSite {
  latitudeDeg: number
  night: string
  /** How dark the forward plan found tonight, which wins over the approximation. */
  planned?: 'full' | 'nautical' | 'short'
}

/**
 * Why tonight looks like this (specs/042-learning, L4): how far the Sun sinks below the user's own
 * horizon tonight, so how dark the night gets, and when that changes with the season.
 */
export function WhyTonight({ site }: { site: TonightSite }): React.ReactElement | null {
  const { level } = useLearning()
  const [sky, setSky] = useState<TonightSkyView | null>(null)

  useEffect(() => {
    // An answer for another site or night must not land on this one.
    let current = true
    setSky(null)
    if (level === 'off') return
    invoke<TonightSkyView>('learning:tonight', { latitude_deg: site.latitudeDeg, night: site.night, planned: site.planned })
      .then(v => { if (current) setSky(v ?? null) })
      .catch(error => console.warn('Tonight’s darkness could not be worked out:', error))
    return () => {
      current = false
    }
  }, [site.latitudeDeg, site.night, site.planned, level])

  if (level === 'off' || !sky) return null
  return (
    <p className="mt-3 text-xs text-astro-muted">
      {sky.text}
      {sky.change && ` ${sky.change}`} <Explain concept={sky.darkness === 'full' ? 'twilight' : 'seasons'} />
    </p>
  )
}
