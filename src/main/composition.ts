import type Database from 'better-sqlite3'
import {
  makeDiscoverTarget,
  makeDiscoverTargets,
  makeDismissSuggestion,
  makeListStackingSuggestions,
  makeReportHiddenData
} from '@astro/application'
import { SqliteFrameCatalogue } from './adapters/sqlite-frame-catalogue'
import { SqliteDismissalStore } from './adapters/sqlite-dismissal-store'
import { systemClock } from './adapters/system-clock'

/**
 * Composition root for the hexagonal core inside the desktop app. IPC handlers call these use
 * cases instead of services as each service is strangled out of src/main/services.
 */
export function composeCore(db: Database.Database) {
  const frames = new SqliteFrameCatalogue(db)
  const dismissals = new SqliteDismissalStore(db)
  return {
    listStackingSuggestions: makeListStackingSuggestions({ frames, dismissals }),
    dismissSuggestion: makeDismissSuggestion({ frames, dismissals, clock: systemClock }),
    discoverTargets: makeDiscoverTargets({ frames }),
    discoverTarget: makeDiscoverTarget({ frames }),
    reportHiddenData: makeReportHiddenData({ frames })
  }
}

export type Core = ReturnType<typeof composeCore>
