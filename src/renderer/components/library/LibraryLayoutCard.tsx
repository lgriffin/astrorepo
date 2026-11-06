import React, { useCallback, useEffect, useState } from 'react'
import { invoke } from '../../hooks/useIPC'
import { Badge, Button, Loading } from '../ui'
import { settingsLink } from '@shared/navigation'
import { LIBRARY_PART_NAMES, suggestedLayout, type ChooseLayoutResult, type LibraryLayoutView, type LibraryPart, type LibraryPartView } from '@shared/library-layout'

const SOURCE: Record<LibraryPartView['source'], { word: string; tone: 'accent' | 'neutral' | 'warning' }> = {
  chosen: { word: 'Chosen by you', tone: 'accent' },
  named: { word: 'Found by its name', tone: 'neutral' },
  missing: { word: 'Not there', tone: 'warning' }
}

type OkView = Extract<LibraryLayoutView, { status: 'ok' }>

/**
 * Which folder holds each part of the library, and the folder the app suggests for it with its
 * reasons (specs/044-library-layout). On Settings → Folders it lists every part with Choose, Use
 * the suggestion and Go back to the default; on Library it shows only when the suggestion would
 * change something, so it is seen before a scan.
 */
export function LibraryLayoutCard({ place }: { place: 'settings' | 'library' }): React.ReactElement | null {
  const [view, setView] = useState<LibraryLayoutView | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [problems, setProblems] = useState<string[]>([])
  const [saved, setSaved] = useState<string | null>(null)

  const load = useCallback(async () => {
    setView(await invoke<LibraryLayoutView>('library:layout'))
  }, [])

  useEffect(() => { void load() }, [load])

  const choose = async (layout: Partial<Record<LibraryPart, string | null>>, what: string, done: string): Promise<void> => {
    setBusy(what)
    setProblems([])
    setSaved(null)
    try {
      const result = await invoke<ChooseLayoutResult>('library:choose-layout', { layout })
      if (result.saved) {
        setSaved(done)
        await load()
      } else {
        setProblems(result.problems)
      }
    } finally {
      setBusy(null)
    }
  }

  const pick = async (part: LibraryPart, label: string): Promise<void> => {
    const result = await invoke<{ path: string | null }>('settings:pick-folder')
    if (result.path) await choose({ [part]: result.path }, part, `${label} are read from ${result.path}. Scan the library to use it.`)
  }

  if (view === null) return place === 'settings' ? <Loading label="Looking inside your home folder" rows={4} /> : null
  if (view.status === 'no-home') return null
  if (place === 'library' && view.changes === 0 && !view.byTarget) return null

  const all = suggestedLayout(view)
  const status = (
    <>
      {problems.length > 0 && (
        <ul role="alert" className="mt-3 space-y-1 text-xs text-astro-danger">
          {problems.map(p => <li key={p}>{p}</li>)}
        </ul>
      )}
      {saved && <p role="status" className="mt-3 text-xs text-astro-success">{saved}</p>}
    </>
  )

  if (place === 'library') {
    return (
      <section aria-labelledby="layout-heading" className="rounded-lg border border-astro-accent/40 bg-astro-surface p-4">
        <h2 id="layout-heading" className="text-base font-semibold text-astro-text">How your library is laid out</h2>
        <p className="mt-1 text-sm text-astro-muted">{view.summary}</p>
        <ByTarget view={view} />
        <ul className="mt-3 space-y-3">
          {view.parts.filter(p => p.change).map(p => <Suggestion key={p.part} part={p} />)}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {view.changes > 0 && (
            <Button variant="primary" busy={busy === 'all'} onClick={() => void choose(all, 'all', 'Saved. Scan the library to read these folders.')}>
              Use {view.changes === 1 ? 'this folder' : 'these folders'}
            </Button>
          )}
          <a href={`#${settingsLink('folders')}`} className="text-xs text-astro-accent hover:underline">Choose the folders yourself in Settings</a>
        </div>
        {status}
      </section>
    )
  }

  return (
    <section aria-labelledby="layout-heading" className="rounded-lg border border-astro-border bg-astro-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="layout-heading" className="text-base font-semibold text-astro-text">Library layout</h2>
        <div className="flex gap-2">
          {view.changes > 0 && (
            <Button size="sm" variant="primary" busy={busy === 'all'} onClick={() => void choose(all, 'all', 'Saved. Scan the library to read these folders.')}>
              Use every suggestion
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => void load()}>Look again</Button>
        </div>
      </div>
      <p className="mt-1 text-xs text-astro-muted">
        Which folder in {view.home} holds each part. The app looks at each folder&apos;s name and the files inside it and suggests one; a folder you choose is never changed.
      </p>
      <p className="mt-2 text-sm text-astro-text">{view.summary}</p>
      <ByTarget view={view} />
      <ul className="mt-4 space-y-5">
        {view.parts.map(p => (
          <li key={p.part}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-astro-text">{p.label}</span>
              <Badge tone={SOURCE[p.source].tone}>{SOURCE[p.source].word}</Badge>
            </div>
            <p className="text-xs text-astro-muted">{p.hint}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <div className="flex min-h-9 min-w-0 flex-1 items-center truncate rounded-md border border-astro-border bg-astro-bg px-3 text-sm text-astro-text" title={p.path}>
                {p.path}
              </div>
              <Button busy={busy === p.part} onClick={() => void pick(p.part, p.label)} aria-label={`Choose the folder for ${LIBRARY_PART_NAMES[p.part]}`}>Choose</Button>
              {p.source === 'chosen' && (
                <Button variant="ghost" disabled={busy === p.part} onClick={() => void choose({ [p.part]: null }, p.part, `${p.label} are read from the default folder again.`)} aria-label={`Go back to the default folder for ${LIBRARY_PART_NAMES[p.part]}`}>
                  Default
                </Button>
              )}
            </div>
            {p.change && p.suggestion && (
              <div className="mt-2 rounded-md border border-astro-accent/30 bg-astro-bg p-3">
                <Suggestion part={p} />
                <Button size="sm" className="mt-2" busy={busy === `use-${p.part}`} onClick={() => void choose({ [p.part]: p.suggestion!.path }, `use-${p.part}`, `${p.label} are read from ${p.suggestion!.path}. Scan the library to use it.`)}>
                  Use {p.suggestion.name}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {view.unused.length > 0 && (
        <p className="mt-4 text-xs text-astro-muted">Not read by the scan: {view.unused.join(', ')}.</p>
      )}
      {status}
    </section>
  )
}

function Suggestion({ part }: { part: LibraryPartView }): React.ReactElement | null {
  if (!part.suggestion) return null
  return (
    <div>
      <p className="text-sm text-astro-text">
        <span className="font-medium">{part.label}</span> look like they are in <span className="font-medium">{part.suggestion.name}</span>
      </p>
      <ul className="mt-1 list-disc pl-5 text-xs text-astro-muted">
        {part.suggestion.reasons.map(r => <li key={r}>{r}</li>)}
      </ul>
    </div>
  )
}

function ByTarget({ view }: { view: OkView }): React.ReactElement | null {
  if (!view.byTarget) return null
  return (
    <p className="mt-2 text-xs text-astro-warning">
      Most folders in your home folder are named for objects, so it looks filed by target first (M 31/raw, M 31/stacked). The scan reads one folder per part with a folder per target inside it, so a library filed by target is not read yet.
    </p>
  )
}
