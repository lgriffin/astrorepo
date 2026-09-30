import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { invoke } from '../../hooks/useIPC'
import { Card, LinkButton } from '../common/Card'
import { SETUP_HIDDEN_KEY, setupSteps, showSetup, type SetupStep } from '@shared/setup'
import type { ToolsView } from '@shared/types'

/** A setting's value, or UNREAD when it could not be read (which is not the same as unset). */
const UNREAD = Symbol('unread')
const setting = (key: string): Promise<string | null | typeof UNREAD> =>
  invoke<{ value: string | null }>('settings:get', { key })
    .then(r => r.value)
    .catch(() => UNREAD)

/** "Get set up": the first-run steps on Home until each is done (UX-014). */
export function SetupCard(): React.ReactElement | null {
  const navigate = useNavigate()
  const [steps, setSteps] = useState<SetupStep[] | null>(null)
  const [hidden, setHidden] = useState(true)

  useEffect(() => {
    let current = true
    Promise.all([
      setting('observer_latitude'),
      setting('observer_longitude'),
      setting('home_folder_path'),
      setting('last_library_scan'),
      setting('last_library_scan_folder'),
      invoke<ToolsView>('tools:list')
        .then(v => v.tools.find(t => t.id === 'siril')?.found ?? null)
        .catch(() => null),
      setting(SETUP_HIDDEN_KEY)
    ]).then(([latitude, longitude, homeFolder, lastLibraryScan, lastLibraryScanFolder, sirilFound, hide]) => {
      if (!current) return
      // A step the app could not read is not a step left to do, so the checklist stays away rather than nag.
      if (latitude === UNREAD || longitude === UNREAD || homeFolder === UNREAD || lastLibraryScan === UNREAD || lastLibraryScanFolder === UNREAD || hide === UNREAD) return
      setSteps(setupSteps({ latitude, longitude, homeFolder, lastLibraryScan, lastLibraryScanFolder, sirilFound }))
      setHidden(hide === '1')
    })
    return () => {
      current = false
    }
  }, [])

  if (!steps || !showSetup(steps, hidden)) return null
  const left = steps.filter(s => !s.done).length

  const hide = () => {
    setHidden(true)
    invoke('settings:set', { key: SETUP_HIDDEN_KEY, value: '1' }).catch(() => undefined)
  }

  return (
    <Card title={`Get set up · ${left} ${left === 1 ? 'step' : 'steps'} left`} action={<LinkButton onClick={hide} title="Settings keeps everything here">Hide</LinkButton>}>
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={s.id} className="flex items-start gap-3 text-sm">
            <span className={`shrink-0 w-5 text-center ${s.done ? 'text-green-400' : 'text-astro-muted'}`}>{s.done ? '✓' : `${i + 1}.`}</span>
            <div className="flex-1 min-w-0">
              <p className={s.done ? 'text-astro-muted line-through' : 'text-astro-text'}>{s.label}</p>
              {!s.done && <p className="text-xs text-astro-muted">{s.why}</p>}
            </div>
            {!s.done && <LinkButton onClick={() => navigate(s.link)}>{s.linkLabel}</LinkButton>}
          </li>
        ))}
      </ol>
    </Card>
  )
}
