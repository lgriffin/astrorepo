import React, { useEffect, useState } from 'react'
import { invoke } from '../../hooks/useIPC'
import type { GradeLimitsView } from '@shared/types'

const FIELDS: { key: string; name: keyof GradeLimitsView; label: string; hint: string; step: string }[] = [
  { key: 'grade_max_eccentricity', name: 'maxEccentricity', label: 'Eccentricity up to', hint: 'Trailed stars', step: '0.05' },
  { key: 'grade_max_fwhm_ratio', name: 'maxFwhmRatio', label: "FWHM up to × the night's median", hint: 'Seeing, focus, dew', step: '0.1' },
  { key: 'grade_min_star_ratio', name: 'minStarRatio', label: "Stars at least × the night's median", hint: 'Cloud, haze', step: '0.05' },
  { key: 'grade_max_background_ratio', name: 'maxBackgroundRatio', label: "Background up to × the night's median", hint: 'Moon, dawn', step: '0.1' },
  { key: 'grade_max_fwhm_pixels', name: 'maxFwhmPixels', label: 'FWHM up to (px, blank for none)', hint: 'A fixed limit', step: '0.1' }
]

/** Settings > Frame grading: the limits every light is graded against (specs/019-frame-grading). */
export function GradingSettings(): React.ReactElement {
  const [values, setValues] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)

  const load = (): void => {
    invoke<GradeLimitsView>('grades:limits')
      .then(limits => setValues(Object.fromEntries(FIELDS.map(f => [f.key, limits[f.name] === null ? '' : String(limits[f.name])]))))
      .catch(() => undefined)
  }
  useEffect(load, [])

  async function save(): Promise<void> {
    await Promise.all(FIELDS.map(f => invoke('settings:set', { key: f.key, value: (values[f.key] ?? '').trim() })))
    setSaved(true)
    load()
  }

  return (
    <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
      <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-2">Frame grading</h2>
      <p className="text-xs text-astro-muted mb-3">
        Every light is graded against these before it is stacked. FWHM, stars and background are compared with the median of the same night and filter, so a soft night is not
        thrown away whole. Changing a limit grades every light again without measuring it again. A value out of range goes back to its default.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {FIELDS.map(f => (
          <label key={f.key} className="text-xs text-astro-muted">
            {f.label}
            <input
              type="number"
              step={f.step}
              min={0}
              className="mt-1 w-full bg-astro-bg border border-astro-border rounded px-2 py-1 text-sm text-astro-text"
              value={values[f.key] ?? ''}
              onChange={e => {
                setSaved(false)
                setValues(prev => ({ ...prev, [f.key]: e.target.value }))
              }}
            />
            <span className="block mt-0.5 opacity-70">{f.hint}</span>
          </label>
        ))}
      </div>
      <button onClick={() => void save()} className="mt-3 px-3 py-1 text-xs bg-astro-accent text-white rounded">
        {saved ? 'Saved' : 'Save'}
      </button>
    </div>
  )
}
