import React, { useState } from 'react'
import { SAMPLE_BANNER, SAMPLE_LEAVE_LABEL } from '@shared/sample'
import { Button } from '../ui'
import { switchSample, useSampleStatus } from '../../hooks/useSample'

/**
 * Across the top of every page while the sample is on (EUX-015), with the way back to the person's
 * own data: the app restarts on it and removes the sample (EUX-016).
 */
export function SampleBanner(): React.ReactElement | null {
  const status = useSampleStatus()
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!status?.active) return null
  const leave = async () => {
    setLeaving(true)
    const problem = await switchSample('leave')
    if (problem) {
      setError(problem)
      setLeaving(false)
    }
  }
  return (
    <div role="region" aria-label="Sample data" className="flex flex-wrap items-center gap-3 border-b-2 border-astro-warning bg-astro-surface px-6 py-2 text-sm">
      <p className="flex-1 min-w-0 text-astro-text">{SAMPLE_BANNER}</p>
      {error && <p role="alert" className="text-astro-danger">{error}</p>}
      <Button size="sm" busy={leaving} onClick={() => void leave()}>{leaving ? 'Restarting…' : SAMPLE_LEAVE_LABEL}</Button>
    </div>
  )
}
