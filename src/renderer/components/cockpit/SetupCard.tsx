import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { invoke } from '../../hooks/useIPC'
import { Card, LinkButton } from '../common/Card'
import { SiteQuickForm } from './SiteQuickForm'
import { SETUP_HIDDEN_KEY, setupSteps, showSetup, type SetupStep } from '@shared/setup'
import type { ToolsView } from '@shared/types'

/** A setting's value, or UNREAD when it could not be read (which is not the same as unset). */
const UNREAD = Symbol('unread')
const setting = (key: string): Promise<string | null | typeof UNREAD> =>
  invoke<{ value: string | null }>('settings:get', { key })
    .then(r => r.value)
    .catch(() => UNREAD)

interface SetupCardProps {
  /** Told whether the checklist is on show once it is read, so Home asks for the site only once (EUX-001). */
  onShown?: (shown: boolean) => void
  /** Called after the site is saved from the checklist. */
  onSiteSaved?: () => void
}

/**
 * "Get set up": the first-run steps on Home until each is done (UX-014). The site is set right
 * here, by pasting coordinates (EUX-001, EUX-002).
 */
export function SetupCard({ onShown, onSiteSaved }: SetupCardProps = {}): React.ReactElement | null {
  const navigate = useNavigate()
  const [steps, setSteps] = useState<SetupStep[] | null>(null)
  const [hidden, setHidden] = useState(true)
  const [reads, setReads] = useState(0)
  // The latest callback, so a parent's new function never re-reads the settings.
  const shown = useRef(onShown)
  useEffect(() => {
    shown.current = onShown
  }, [onShown])

  useEffect(() => {
    let current = true
    Promise.all([
      setting('observer_latitude'),
      setting('observer_longitude'),
      setting('home_folder_path'),
      setting('last_library_scan'),
      setting('last_library_scan_folder'),
      invoke<ToolsView>('tools:list').catch(() => null),
      setting(SETUP_HIDDEN_KEY)
    ]).then(([latitude, longitude, homeFolder, lastLibraryScan, lastLibraryScanFolder, tools, hide]) => {
      if (!current) return
      // A step the app could not read is not a step left to do, so the checklist stays away rather than nag.
      if (latitude === UNREAD || longitude === UNREAD || homeFolder === UNREAD || lastLibraryScan === UNREAD || lastLibraryScanFolder === UNREAD || hide === UNREAD) {
        shown.current?.(false)
        return
      }
      const sirilFound = tools?.tools.find(t => t.id === 'siril')?.found ?? null
      const next = setupSteps({ latitude, longitude, homeFolder, lastLibraryScan, lastLibraryScanFolder, sirilFound, missingCatalogues: tools?.missingCatalogues ?? null })
      setSteps(next)
      setHidden(hide === '1')
      shown.current?.(showSetup(next, hide === '1'))
    })
    return () => {
      current = false
    }
  }, [reads])

  if (!steps || !showSetup(steps, hidden)) return null
  const left = steps.filter(s => !s.done).length

  const hide = () => {
    setHidden(true)
    shown.current?.(false)
    invoke('settings:set', { key: SETUP_HIDDEN_KEY, value: '1' }).catch(() => undefined)
  }
  const siteSaved = () => {
    setReads(n => n + 1)
    onSiteSaved?.()
  }

  return (
    <Card title={`Get set up · ${left} ${left === 1 ? 'step' : 'steps'} left`} action={<LinkButton onClick={hide} title="Settings keeps everything here">Hide</LinkButton>}>
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={s.id} className="flex items-start gap-3 text-sm">
            <span className={`shrink-0 w-5 text-center ${s.done ? 'text-astro-success' : 'text-astro-muted'}`}>{s.done ? '✓' : `${i + 1}.`}</span>
            <div className="flex-1 min-w-0">
              <p className={s.done ? 'text-astro-muted line-through' : 'text-astro-text'}>{s.label}</p>
              {!s.done && <p className="text-xs text-astro-muted">{s.why}</p>}
              {!s.done && s.id === 'site' && <SiteQuickForm onSaved={siteSaved} />}
            </div>
            {!s.done && <LinkButton onClick={() => navigate(s.link)}>{s.id === 'site' ? 'More in Your site' : s.linkLabel}</LinkButton>}
          </li>
        ))}
      </ol>
    </Card>
  )
}
