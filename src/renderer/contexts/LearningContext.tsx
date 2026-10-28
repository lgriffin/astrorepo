import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { LEARNING_SETTING_KEY, parseLearningLevel, type LearningLevel } from '@shared/learning'
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
}

const EMPTY: LearningLibraryView = { concepts: [], primers: [], sources: [] }

const LearningContext = createContext<LearningContextValue | null>(null)

/** The knowledge base and the learning level, read once for the whole screen (specs/042-learning). */
export function LearningProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [level, setLevel] = useState<LearningLevel>('short')
  const [library, setLibrary] = useState<LearningLibraryView>(EMPTY)

  useEffect(() => {
    let current = true
    invoke<LearningLibraryView>('learning:library')
      .then(l => { if (current && l) setLibrary(l) })
      .catch(() => {})
    invoke<{ value: string | null }>('settings:get', { key: LEARNING_SETTING_KEY })
      .then(r => { if (current) setLevel(parseLearningLevel(r?.value)) })
      .catch(() => {})
    return () => {
      current = false
    }
  }, [])

  const choose = useCallback(async (next: LearningLevel): Promise<boolean> => {
    setLevel(next)
    try {
      await invoke('settings:set', { key: LEARNING_SETTING_KEY, value: next })
      return true
    } catch {
      return false
    }
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
      openSource: id => { void invoke('learning:open-source', { source_id: id }).catch(() => {}) }
    }
  }, [library, level, choose])

  return <LearningContext.Provider value={value}>{children}</LearningContext.Provider>
}

export function useLearning(): LearningContextValue {
  const value = useContext(LearningContext)
  if (!value) throw new Error('useLearning must be used inside LearningProvider')
  return value
}
