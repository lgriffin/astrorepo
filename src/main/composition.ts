import type Database from 'better-sqlite3'
import {
  makeDiscoverTarget,
  makeDiscoverTargets,
  makeDismissSuggestion,
  makeFindDuplicates,
  makeListStackingSuggestions,
  makePrepareSirilWorkspace,
  makeReportHiddenData
} from '@astro/application'
import { SqliteFrameCatalogue } from './adapters/sqlite-frame-catalogue'
import { SqliteDismissalStore } from './adapters/sqlite-dismissal-store'
import { SqliteFileHashStore, SqliteFileIndex } from './adapters/sqlite-file-hashing'
import { NodeContentHasher } from './adapters/node-content-hasher'
import { NodeSirilWorkspace } from './adapters/node-siril-workspace'
import { systemClock } from './adapters/system-clock'

/**
 * Composition root for the hexagonal core inside the desktop app. IPC handlers call these use
 * cases instead of services as each service is strangled out of src/main/services.
 */
export function composeCore(db: Database.Database) {
  const frames = new SqliteFrameCatalogue(db)
  const dismissals = new SqliteDismissalStore(db)
  const hashes = new SqliteFileHashStore(db, () => systemClock.now())
  return {
    listStackingSuggestions: makeListStackingSuggestions({ frames, dismissals }),
    dismissSuggestion: makeDismissSuggestion({ frames, dismissals, clock: systemClock }),
    discoverTargets: makeDiscoverTargets({ frames }),
    discoverTarget: makeDiscoverTarget({ frames }),
    reportHiddenData: makeReportHiddenData({ frames, hashes }),
    findDuplicates: makeFindDuplicates({ files: new SqliteFileIndex(db), hasher: new NodeContentHasher(), hashes }),
    prepareSirilWorkspace: makePrepareSirilWorkspace({ workspace: new NodeSirilWorkspace(db) })
  }
}

export type Core = ReturnType<typeof composeCore>
