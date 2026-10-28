import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { LEARNING_SETTING_KEY, TRAIL_KEY, makeSaveQueue, parseLearningLevel, parseTrail, withOpened, type LearningLevel } from '@shared/learning'
import type { ConceptView, LearningLibraryView, LearningSourceView, ObjectPrimerView } from '@shared/types'
import { invoke } from '../hooks/useIPC'

interface LearningContextValue {
  /** How much the app explains (LRN-004). */
  level: LearningLevel
  /** Saves a new level and applies it at once; resolves false when it could not be saved. */
  choose: (level: LearningLevel) => Promise<boolean>
  concept: (id: string) => ConceptView | null
  primer: (kind: string) => ObjectPrimerView | null
  source: (id: string) => LearningSourceView | null
  /** Opens a source's page by its id; the address never passes through the page (LRN-005). */
  openSource: (id: string) => void
  /** Every concept and the themes they sit under, for the Learn page and the command palette. */
  library: LearningLibraryView
  /** Ideas opened on this computer, most recent first (LRN-025). */
  trail: string[]
  /** Puts an opened idea at the head of the trail; nothing is kept while learning is off. */
  remember: (id: string) => void
  /** Empties the trail. */
  forget: () => void
}

/** The trail as this browser keeps it; storage may be blocked, so every read and write is guarded. */
function readTrail(): string[] {
  try {
    return parseTrail(localStorage.getItem(TRAIL_KEY))
  } catch {
    return []
  }
}

function saveTrail(trail: string[]): void {
  try {
    if (trail.length === 0) localStorage.removeItem(TRAIL_KEY)
    else localStorage.setItem(TRAIL_KEY, JSON.stringify(trail))
  } catch {
    // The trail is a convenience; without storage it lasts until the window closes.
  }
}

const EMPTY: LearningLibraryView = { concepts: [], themes: [], primers: [], sources: [] }

const LearningContext = createContext<LearningContextValue | null>(null)

/** The knowledge base and the learning level, read once for the whole screen (specs/042-learning). */
export function LearningProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [level, setLevel] = useState<LearningLevel>('deep')
  const [library, setLibrary] = useState<LearningLibraryView>(EMPTY)
  const [trail, setTrail] = useState<string[]>(readTrail)
  // Once the user has chosen on this screen, a saved level read at start must not overwrite it.
  const chosen = useRef(false)
  const save = useMemo(() => makeSaveQueue(async value => { await invoke('settings:set', { key: LEARNING_SETTING_KEY, value }) }), [])

  useEffect(() => {
    let current = true
    invoke<LearningLibraryView>('learning:library')
      .then(l => { if (current && l) setLibrary(l) })
      .catch(error => console.warn('The learning library could not be read:', error))
    invoke<{ value: string | null }>('settings:get', { key: LEARNING_SETTING_KEY })
      .then(r => { if (current && !chosen.current) setLevel(parseLearningLevel(r?.value)) })
      .catch(() => {})
    return () => {
      current = false
    }
  }, [])

  const choose = useCallback((next: LearningLevel): Promise<boolean> => {
    chosen.current = true
    setLevel(next)
    return save(next)
  }, [save])

  const remember = useCallback(
    (id: string) => {
      if (level === 'off') return
      setTrail(t => {
        if (t[0] === id) return t
        const next = withOpened(t, id)
        saveTrail(next)
        return next
      })
    },
    [level]
  )

  const forget = useCallback(() => {
    saveTrail([])
    setTrail([])
  }, [])

  const value = useMemo<LearningContextValue>(() => {
    const concepts = new Map(library.concepts.map(c => [c.id, c]))
    const primers = new Map(library.primers.map(p => [p.kind, p]))
    const sources = new Map(library.sources.map(s => [s.id, s]))
    return {
      level,
      choose,
      concept: id => concepts.get(id) ?? null,
      primer: kind => primers.get(kind) ?? primers.get('unknown') ?? null,
      source: id => sources.get(id) ?? null,
      openSource: id => { void invoke('learning:open-source', { source_id: id }).catch(() => {}) },
      library,
      trail,
      remember,
      forget
    }
  }, [library, level, choose, trail, remember, forget])

  return <LearningContext.Provider value={value}>{children}</LearningContext.Provider>
}

export function useLearning(): LearningContextValue {
  const value = useContext(LearningContext)
  if (!value) throw new Error('useLearning must be used inside LearningProvider')
  return value
}
