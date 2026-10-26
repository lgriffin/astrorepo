import React, { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PageContainer } from '../components/common/PageContainer'
import { invoke } from '../hooks/useIPC'
import type { CatalogueView, ToolHealthView, ToolsView } from '@shared/types'
import { RunWindowSettings } from '../components/jobs/RunWindowSettings'
import { GradingSettings } from '../components/target/GradingSettings'
import { WeatherSettings } from '../components/weather/WeatherSettings'
import { CompanionSettings } from '../components/companion/CompanionSettings'
import { AppearanceSettings } from '../components/settings/AppearanceSettings'
import { EquipmentSettings } from '../components/settings/EquipmentSettings'
import { Button, Checkbox, Field, Input } from '../components/ui'
import { SETTINGS_GROUPS, SETTINGS_SECTIONS, settingsLink, settingsSectionFrom, type SettingsSection } from '@shared/navigation'
import { SETUP_HIDDEN_KEY } from '@shared/setup'

interface FolderSetting {
  key: string
  label: string
  description: string
  value: string
}

const FOLDER_SETTINGS: Array<{ key: string; label: string; description: string }> = [
  {
    key: 'home_folder_path',
    label: 'Home folder',
    description: 'The folder that holds your raw, stacked, tif and images folders.'
  },
  {
    key: 'fits_master_folder',
    label: 'FITS folder',
    description: 'Where your FITS files are. The FITS files page starts here.'
  },
  {
    key: 'archive_root',
    label: 'Archive folder',
    description: 'Where Archive this target puts finished targets, for example a share on the NAS. When not set, archives go in the archive folder of the work area. It must be outside the folders the app only reads.'
  },
  {
    key: 'vespera_landing',
    label: 'Vespera copies',
    description: "Where observations copied off the Vespera land, one folder per target. When not set, they land in the home folder's raw folder, so the home scan finds them."
  },
  {
    key: 'base_folder_path',
    label: 'New target folders',
    description: 'Where the app makes a folder for a new target, with lights, darks, flats and biases inside.'
  }
]

const OBSERVER_SETTINGS = [
  { key: 'observer_latitude', label: 'Latitude (°N)', placeholder: 'For example 51.5074', min: -90, max: 90 },
  { key: 'observer_longitude', label: 'Longitude (°E)', placeholder: 'For example -0.1278', min: -180, max: 180 },
  { key: 'observer_elevation', label: 'Elevation (m)', placeholder: 'For example 100', min: 0, max: 10000 }
]

/** Each section drawn on its own (LF-024); the page shows one at a time. */
const SECTION_VIEWS: Record<SettingsSection, () => React.ReactElement> = {
  location: () => <LocationSection />,
  equipment: () => <EquipmentSettings />,
  weather: () => <WeatherSettings />,
  folders: () => <FoldersSection />,
  tools: () => <ToolsSection />,
  import: () => <ImportSection />,
  'run-window': () => <RunWindowSettings />,
  grading: () => <GradingSettings />,
  appearance: () => <AppearanceSettings />,
  companions: () => <CompanionSettings />,
  reset: () => <ResetSection />
}

/**
 * Settings as pages (LF-024): the sections listed by group down the side, the chosen one beside
 * them. A link such as "Change the run window in Settings" opens that section; a link that names
 * none opens the first.
 */
export function Settings(): React.ReactElement {
  const { search } = useLocation()
  const navigate = useNavigate()
  const active = settingsSectionFrom(search) ?? SETTINGS_SECTIONS[0].id
  // Each section is its own history entry, so Back returns to the one before.
  const open = (id: SettingsSection): void => { void navigate(settingsLink(id)) }
  const current = SETTINGS_SECTIONS.find(s => s.id === active)!
  const View = SECTION_VIEWS[active]

  return (
    <PageContainer>
      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <nav aria-label="Settings sections" className="md:sticky md:top-0 md:w-52 md:shrink-0">
          {/* Narrow windows get a list to pick from instead of the column. */}
          <label className="md:hidden">
            <span className="sr-only">Settings section</span>
            <select
              value={active}
              onChange={e => open(e.target.value as SettingsSection)}
              className="h-9 w-full rounded-md border border-astro-border bg-astro-bg px-3 text-sm text-astro-text"
            >
              {SETTINGS_GROUPS.map(g => (
                <optgroup key={g} label={g}>
                  {SETTINGS_SECTIONS.filter(s => s.group === g).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <div className="hidden space-y-4 md:block">
            {SETTINGS_GROUPS.map(g => (
              <div key={g}>
                <p className="px-3 pb-1 font-condensed text-xs text-astro-muted">{g}</p>
                <ul className="space-y-0.5">
                  {SETTINGS_SECTIONS.filter(s => s.group === g).map(s => (
                    <li key={s.id}>
                      <a
                        href={`#${settingsLink(s.id)}`}
                        onClick={e => { e.preventDefault(); open(s.id) }}
                        aria-current={s.id === active ? 'page' : undefined}
                        className={`block rounded-md px-3 py-1.5 text-sm transition-colors ${
                          s.id === active ? 'bg-astro-raised text-astro-text font-medium' : 'text-astro-muted hover:bg-astro-raised hover:text-astro-text'
                        }`}
                      >
                        {s.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        <div id={`settings-${active}`} className="min-w-0 max-w-3xl flex-1">
          <p className="mb-3 font-condensed text-xs text-astro-muted">{current.group}</p>
          <View key={active} />
        </div>
      </div>
    </PageContainer>
  )
}

/** Settings > Your site: where the user observes from (UX-013). */
function LocationSection(): React.ReactElement {
  const [observer, setObserver] = useState<Record<string, string> | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [narrowband, setNarrowband] = useState(true)

  useEffect(() => {
    void Promise.all(
      OBSERVER_SETTINGS.map(async s => [s.key, (await invoke<{ value: string | null }>('settings:get', { key: s.key })).value ?? ''] as const)
    ).then(values => setObserver(Object.fromEntries(values)))
    void invoke<{ value: string | null }>('settings:get', { key: 'has_narrowband_filter' }).then(nb =>
      setNarrowband(nb.value === null || !['false', '0', 'no'].includes(nb.value.toLowerCase()))
    )
  }, [])

  const save = async (): Promise<void> => {
    setSaving(true)
    // A cleared field is saved blank, which clears the site rather than keeping the old value.
    await Promise.all(OBSERVER_SETTINGS.map(s => invoke('settings:set', { key: s.key, value: (observer?.[s.key] ?? '').trim() })))
    setSaving(false)
    setSaved(true)
  }

  return (
    <div className="rounded-lg border border-astro-border bg-astro-surface p-4">
      <h2 className="text-base font-semibold text-astro-text">Your site</h2>
      <p className="mt-1 mb-4 text-xs text-astro-muted">
        Used by the Sky planner and Home for the weather, seasons, moon windows, twilight times and altitude curves.
      </p>
      <form onSubmit={e => { e.preventDefault(); void save() }}>
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {OBSERVER_SETTINGS.map(s => (
            <Field key={s.key} label={s.label}>
              {c => (
                <Input
                  id={c.id}
                  type="number"
                  step="any"
                  min={s.min}
                  max={s.max}
                  disabled={observer === null}
                  value={observer?.[s.key] ?? ''}
                  onChange={e => { setSaved(false); setObserver(prev => ({ ...prev, [s.key]: e.target.value })) }}
                  placeholder={s.placeholder}
                />
              )}
            </Field>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" busy={saving} disabled={observer === null}>Save your site</Button>
          {saved && <span role="status" className="text-xs text-astro-success">Saved</span>}
        </div>
      </form>
      <Checkbox
        className="mt-4"
        checked={narrowband}
        onChange={e => {
          const next = e.target.checked
          setNarrowband(next)
          void invoke('settings:set', { key: 'has_narrowband_filter', value: String(next) })
        }}
        label="I have a dual-band or narrowband filter"
        hint="The Seestar S50's light-pollution filter counts. With it, emission nebulae are still suggested when the moon is bright."
      />
    </div>
  )
}

/** Settings > Folders. */
function FoldersSection(): React.ReactElement {
  const [folders, setFolders] = useState<FolderSetting[] | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    void Promise.all(
      FOLDER_SETTINGS.map(async s => ({ ...s, value: (await invoke<{ value: string | null }>('settings:get', { key: s.key })).value ?? '' }))
    ).then(setFolders)
  }, [])

  const set = async (key: string, value: string): Promise<void> => {
    setSaving(key)
    await invoke('settings:set', { key, value })
    setFolders(prev => prev?.map(f => (f.key === key ? { ...f, value } : f)) ?? null)
    setSaving(null)
  }

  const browse = async (key: string): Promise<void> => {
    const result = await invoke<{ path: string | null }>('settings:pick-folder')
    if (result.path) await set(key, result.path)
  }

  return (
    <div className="rounded-lg border border-astro-border bg-astro-surface p-4">
      <h2 className="mb-4 text-base font-semibold text-astro-text">Folders</h2>
      <div className="space-y-5">
        {(folders ?? FOLDER_SETTINGS.map(f => ({ ...f, value: '' }))).map(folder => (
          <div key={folder.key}>
            <p className="text-sm font-medium text-astro-text">{folder.label}</p>
            <p className="mb-2 text-xs text-astro-muted">{folder.description}</p>
            <div className="flex gap-2">
              <div className="flex min-h-9 min-w-0 flex-1 items-center truncate rounded-md border border-astro-border bg-astro-bg px-3 text-sm text-astro-text">
                {folders === null ? <span className="text-astro-muted">Reading…</span> : folder.value || <span className="text-astro-muted">Not set</span>}
              </div>
              <Button onClick={() => void browse(folder.key)} busy={saving === folder.key} disabled={folders === null} aria-label={`Choose the ${folder.label.toLowerCase()}`}>
                Choose
              </Button>
              {folder.value && (
                <Button variant="ghost" onClick={() => void set(folder.key, '')} disabled={saving === folder.key} aria-label={`Clear the ${folder.label.toLowerCase()}`}>
                  Clear
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Settings > Import and export. */
function ImportSection(): React.ReactElement {
  const [importResult, setImportResult] = useState<string | null>(null)
  return (
    <div className="space-y-4 rounded-lg border border-astro-border bg-astro-surface p-4">
      <h2 className="text-base font-semibold text-astro-text">Import and export</h2>
      <div>
        <h3 className="mb-2 text-sm text-astro-text">Export as CSV</h3>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void invoke('export:targets-csv')}>Targets</Button>
          <Button onClick={() => void invoke('export:sessions-csv')}>Nights</Button>
          <Button onClick={() => void invoke('export:fits-csv')}>FITS files</Button>
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm text-astro-text">Import</h3>
        <Button
          onClick={async () => {
            const pick = await invoke<{ path: string | null }>('import:pick-file')
            if (!pick.path) return
            const result = await invoke<{ created: unknown[]; skipped: string[] }>('import:nina-sequence', { file_path: pick.path })
            setImportResult(`Imported ${result.created.length} targets.${result.skipped.length > 0 ? ` Skipped: ${result.skipped.join(', ')}` : ''}`)
          }}
        >
          Import a NINA sequence
        </Button>
        {importResult && <p role="status" className="mt-2 text-xs text-astro-muted">{importResult}</p>}
      </div>
    </div>
  )
}

/** Settings > Start again. */
function ResetSection(): React.ReactElement {
  const [confirming, setConfirming] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [checklist, setChecklist] = useState<string | null>(null)
  return (
    <div className="space-y-4 rounded-lg border border-astro-danger/30 bg-astro-surface p-4">
      <h2 className="text-base font-semibold text-astro-danger">Start again</h2>
      <div>
        <p className="mb-2 text-xs text-astro-muted">Hid the Get set up checklist on Home?</p>
        <Button
          size="sm"
          onClick={async () => {
            await invoke('settings:set', { key: SETUP_HIDDEN_KEY, value: '' })
            setChecklist('The checklist is back on Home.')
          }}
        >
          Show it again
        </Button>
        {checklist && <span role="status" className="ml-3 text-xs text-astro-success">{checklist}</span>}
      </div>
      <div>
        <p className="mb-3 text-xs text-astro-muted">
          Clear all targets, FITS scans, nights and scan data from the local database. Folder settings are kept, and your files on disk are not touched.
        </p>
        {!confirming ? (
          <Button variant="danger" onClick={() => setConfirming(true)}>Clear the database</Button>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-astro-danger">Are you sure? This cannot be undone.</span>
            <Button
              variant="danger"
              onClick={async () => {
                try {
                  await invoke('db:reset')
                  setStatus('The database is cleared. Scan your library to fill it again.')
                } catch {
                  setStatus('The database could not be cleared.')
                }
                setConfirming(false)
              }}
            >
              Yes, clear everything
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
          </div>
        )}
        {status && <p role="status" className="mt-3 text-xs text-astro-muted">{status}</p>}
      </div>
    </div>
  )
}

/** Settings > Tools: the tool hub (specs/015-tool-hub, 023-hub-syqon). Saving a path re-checks every tool. */
function ToolsSection(): React.ReactElement {
  const [view, setView] = useState<ToolsView | null>(null)
  const [health, setHealth] = useState<ToolHealthView | null>(null)
  const [healthFailed, setHealthFailed] = useState(false)
  const [editing, setEditing] = useState<Record<string, string>>({})

  const load = (): void => {
    invoke<ToolsView>('tools:list').then(setView).catch(() => setView(null))
    // Versions and SyQon's models come from running each tool's own version or model-list flag.
    setHealthFailed(false)
    invoke<ToolHealthView>('tools:health').then(setHealth).catch(() => setHealthFailed(true))
  }
  useEffect(load, [])

  async function save(key: string, value: string): Promise<void> {
    await invoke('settings:set', { key, value: value.trim() })
    setEditing(e => {
      const next = { ...e }
      delete next[key]
      return next
    })
    load()
  }

  const pathInput = (key: string, placeholder: string, label: string): React.ReactElement => (
    <form className="mt-1 flex gap-2" onSubmit={e => { e.preventDefault(); void save(key, editing[key] ?? '') }}>
      <Input
        className="flex-1"
        aria-label={label}
        placeholder={placeholder}
        value={editing[key] ?? ''}
        onChange={e => setEditing(prev => ({ ...prev, [key]: e.target.value }))}
      />
      <Button type="submit" size="sm" disabled={editing[key] === undefined}>
        {editing[key]?.trim() ? 'Save' : 'Use default'}
      </Button>
    </form>
  )

  const version = (id: string, found: boolean): string | null => {
    if (!found) return null
    if (healthFailed) return 'Version could not be checked'
    if (!health) return 'Checking version…'
    return `Version ${health.versions[id] ?? 'Unknown'}`
  }

  return (
    <div className="rounded-lg border border-astro-border bg-astro-surface p-4">
      <h2 className="mb-2 text-base font-semibold text-astro-text">Tools</h2>
      <p className="text-xs text-astro-muted mb-4">
        Programs the app hands work to. Each is looked for in the path you give here, then in the places it usually installs to. Versions come from each tool&apos;s own version flag; nothing else is run to check.
        {view && <span className="text-astro-text"> {view.summary}</span>}
      </p>
      <div className="space-y-4">
        {view?.tools.filter(t => !t.notNeeded).map(t => (
          <div key={t.id}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-astro-text">{t.label}</span>
              <span className={`text-xs ${t.found ? 'text-astro-success' : t.optional ? 'text-astro-muted' : 'text-astro-warning'}`}>
                {t.found ? t.how : t.optional ? 'Not installed (optional)' : 'Not found'}
              </span>
            </div>
            <p className="text-xs text-astro-muted">{t.purpose}</p>
            {t.path && <p className="text-xs font-mono text-astro-text break-all">{t.path}</p>}
            {version(t.id, t.found) && <p className="text-xs text-astro-muted">{version(t.id, t.found)}</p>}
            {t.settingNote && <p className="text-xs text-astro-warning">{t.settingNote}</p>}
            {t.warning && <p className="text-xs text-astro-warning">{t.warning}</p>}
            {!t.found && t.looked.length > 0 && (
              <details className="text-xs text-astro-muted">
                <summary className="cursor-pointer">Where it looked</summary>
                <ul className="font-mono pl-3">{t.looked.map(l => <li key={l} className="break-all">{l}</li>)}</ul>
              </details>
            )}
            {pathInput(t.settingKey, t.id === 'siril-scripts' ? 'Folder of your Siril_Scripts clone' : 'Full path to the program', `Where ${t.label} is`)}
            {t.catalogues.map(c => <CatalogueRow key={c.id} catalogue={c} input={pathInput(c.settingKey, `Folder holding the ${c.label}`, `Where the ${c.label} is`)} />)}
            {t.id === 'syqon' && t.found && <SyqonModels health={health} />}
          </div>
        ))}
      </div>
    </div>
  )
}

/** One catalogue a tool needs, and whether it is installed (HUB-009). */
function CatalogueRow({ catalogue: c, input }: { catalogue: CatalogueView; input: React.ReactElement }): React.ReactElement {
  return (
    <div className="mt-2 pl-3 border-l border-astro-border">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-astro-text">{c.label}</span>
        <span className={`text-xs ${c.state === 'present' ? 'text-astro-success' : c.state === 'missing' ? 'text-astro-warning' : 'text-astro-muted'}`}>
          {c.state === 'present' ? 'Installed' : c.state === 'missing' ? 'Not installed' : 'Not checked'}
        </span>
      </div>
      <p className={`text-xs ${c.state === 'missing' ? 'text-astro-warning' : 'text-astro-muted'} break-all`}>{c.text}</p>
      {c.looked.length > 0 && (
        <details className="text-xs text-astro-muted">
          <summary className="cursor-pointer">Where it looked</summary>
          <ul className="font-mono pl-3">{c.looked.map(l => <li key={l} className="break-all">{l}</li>)}</ul>
        </details>
      )}
      {c.state !== 'not-checked' && input}
    </div>
  )
}

/** The models the SyQon CLI listed, and which the account may use (HUB-007). */
function SyqonModels({ health }: { health: ToolHealthView | null }): React.ReactElement | null {
  if (!health) return null
  if (health.modelsNote) return <p className="text-xs text-astro-warning mt-1">{health.modelsNote}</p>
  if (!health.models) return null
  if (health.models.length === 0) return <p className="text-xs text-astro-muted mt-1">The SyQon CLI listed no models.</p>
  return (
    <table className="mt-2 text-xs w-full">
      <tbody>
        {health.models.map(m => (
          <tr key={m.id}>
            <td className="font-mono text-astro-text pr-2">{m.id}</td>
            <td className="text-astro-muted pr-2">{m.step}</td>
            <td className={m.available ? 'text-astro-success' : 'text-astro-muted'}>{m.available ? 'Available' : `Not available (${m.status})`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
