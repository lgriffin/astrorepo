import React, { useState } from 'react'
import { invoke } from '../../hooks/useIPC'
import { Button, Field, Input } from '../ui'
import { readCoordinates } from '@shared/coordinates'

/**
 * Sets the site from Home in one field (EUX-001, EUX-002): coordinates pasted from a map, a map
 * link, or degrees, minutes and seconds. Elevation and sky quality stay in Settings → Your site.
 */
export function SiteQuickForm({ onSaved }: { onSaved: () => void }): React.ReactElement {
  const [text, setText] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async (): Promise<void> => {
    const reading = readCoordinates(text)
    // Nothing is saved from coordinates that cannot be read (EUX-003).
    if (!reading.ok) {
      setProblem(reading.problem)
      return
    }
    setSaving(true)
    try {
      await invoke('settings:set', { key: 'observer_latitude', value: String(reading.latitude) })
      await invoke('settings:set', { key: 'observer_longitude', value: String(reading.longitude) })
      onSaved()
    } catch {
      setProblem('Could not save your site. Try again, or set it in Settings → Your site.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="mt-2 flex flex-wrap items-start gap-2" onSubmit={e => { e.preventDefault(); void save() }}>
      <Field className="w-full sm:w-96" label="Where your scopes stand" hint="Paste from a map: 53.35, -6.26, a map link, or 53°20′59″N 6°15′37″W." error={problem}>
        {c => (
          <Input
            id={c.id}
            aria-describedby={c.describedBy}
            aria-invalid={c.invalid}
            value={text}
            onChange={e => { setText(e.target.value); setProblem(null) }}
            placeholder="Latitude, longitude"
          />
        )}
      </Field>
      <Button type="submit" variant="primary" busy={saving} disabled={text.trim() === ''} className="sm:mt-5">Save your site</Button>
    </form>
  )
}
