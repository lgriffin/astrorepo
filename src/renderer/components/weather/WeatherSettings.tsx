import React, { useEffect, useState } from 'react'
import { invoke } from '../../hooks/useIPC'
import type { ClearSkiesView } from '@shared/types'

const PROVIDER_KEY = 'weather_provider'
const SERVICE_KEY = 'weather_service_address'

const PROVIDERS = [
  { id: 'open-meteo', label: 'Open-Meteo (free, no key; the main weather models)' },
  { id: 'met-norway', label: 'MET Norway (free, no key; strong across Europe)' },
  { id: 'none', label: 'None: only my weather service' }
] as const

/** Settings > Weather: the public forecast and the user's own weather service (specs/036-clear-skies, WX-003). */
export function WeatherSettings(): React.ReactElement {
  const [provider, setProvider] = useState('open-meteo')
  const [address, setAddress] = useState('')
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [check, setCheck] = useState<string[] | null>(null)

  useEffect(() => {
    void Promise.all([
      invoke<{ value: string | null }>('settings:get', { key: PROVIDER_KEY }),
      invoke<{ value: string | null }>('settings:get', { key: SERVICE_KEY })
    ])
      .then(([p, a]) => {
        setProvider(PROVIDERS.some(x => x.id === p.value) ? (p.value as string) : 'open-meteo')
        setAddress(a.value ?? '')
      })
      .catch(() => undefined)
  }, [])

  /** Saves the forecast, then the address; says so if either could not be saved. */
  async function save(): Promise<boolean> {
    setSaveError(null)
    try {
      await invoke('settings:set', { key: PROVIDER_KEY, value: provider })
      await invoke('settings:set', { key: SERVICE_KEY, value: address.trim() })
      setSaved(true)
      return true
    } catch (error) {
      setSaved(false)
      setSaveError(`Could not save the weather settings: ${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }

  /** Saves what the form holds, then asks every source now rather than using the answers kept for Home. */
  async function checkNow(): Promise<void> {
    if (!(await save())) return
    setCheck(['Asking…'])
    try {
      const outlook = await invoke<ClearSkiesView>('weather:outlook', { fresh: true })
      if (outlook.status !== 'ok') setCheck([outlook.message])
      else setCheck(outlook.sources.map(s => (s.problem === null ? `${s.name} answered.` : `${s.name} could not be used: ${s.problem}`)))
    } catch {
      setCheck(['Could not ask for the forecast.'])
    }
  }

  return (
    <div className="bg-astro-surface border border-astro-border rounded-lg p-4">
      <h2 className="text-sm font-semibold text-astro-muted uppercase tracking-wider mb-2">Weather</h2>
      <p className="text-xs text-astro-muted mb-3">
        Home shows whether the next three nights look clear at your site. Only your site&apos;s latitude and longitude, rounded to
        about a kilometre, are sent to the forecast; your weather service is asked for its own station&apos;s forecast.
      </p>
      <label className="block text-xs text-astro-muted mb-3">
        Forecast
        <select
          value={provider}
          onChange={e => {
            setSaved(false)
            setProvider(e.target.value)
          }}
          className="mt-1 w-full bg-astro-bg border border-astro-border rounded px-2 py-1.5 text-sm text-astro-text"
        >
          {PROVIDERS.map(p => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs text-astro-muted">
        Your weather service (weatherlink_website)
        <input
          type="url"
          value={address}
          placeholder="e.g. http://nas.local:1456"
          onChange={e => {
            setSaved(false)
            setAddress(e.target.value)
          }}
          className="mt-1 w-full bg-astro-bg border border-astro-border rounded px-2 py-1.5 text-sm text-astro-text"
        />
        <span className="block mt-1">
          Its forecast for tonight (chance of rain and frost, the low) and the weather warnings in force are added to Home. Leave it empty if you
          have none.
        </span>
      </label>
      <div className="flex gap-2 mt-3">
        <button onClick={() => void save()} className="px-3 py-1 text-xs bg-astro-accent text-white rounded">
          {saved ? 'Saved' : 'Save'}
        </button>
        <button onClick={() => void checkNow()} className="px-3 py-1 text-xs border border-astro-border text-astro-muted rounded hover:text-astro-text">
          Save and check
        </button>
      </div>
      {saveError && <p className="text-xs text-red-400 mt-2">{saveError}</p>}
      {check && (
        <ul className="mt-2 space-y-0.5">
          {check.map(line => (
            <li key={line} className="text-xs text-astro-muted">{line}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
