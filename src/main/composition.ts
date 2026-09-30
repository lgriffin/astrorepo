import type Database from 'better-sqlite3'
import {
  makeDiscoverTarget,
  makeDiscoverTargets,
  makeDismissSuggestion,
  makeEstimateSirilRun,
  makeFindDuplicates,
  makeListNextActions,
  makeListStackingSuggestions,
  makeListTools,
  makePlanPostProcessing,
  makePlanForward,
  makePrepareSirilWorkspace,
  makeReportHiddenData
} from '@astro/application'
import { SqliteFrameCatalogue } from './adapters/sqlite-frame-catalogue'
import { SqliteDismissalStore } from './adapters/sqlite-dismissal-store'
import { SqliteFileHashStore, SqliteFileIndex } from './adapters/sqlite-file-hashing'
import { NodeContentHasher } from './adapters/node-content-hasher'
import { NodeSirilWorkspace } from './adapters/node-siril-workspace'
import { systemClock } from './adapters/system-clock'
import { AstronomyEngineEphemeris } from './adapters/astronomy-engine-ephemeris'
import { SqlitePlanningSettings, SqliteTargetPositions } from './adapters/sqlite-planning'
import { NodeToolHub } from './adapters/node-tool-hub'
import { SqliteStackCatalogue } from './adapters/sqlite-stack-catalogue'

/**
 * Composition root for the hexagonal core inside the desktop app. IPC handlers call these use
 * cases instead of services as each service is strangled out of src/main/services.
 */
export function composeCore(db: Database.Database) {
  const frames = new SqliteFrameCatalogue(db)
  const dismissals = new SqliteDismissalStore(db)
  const hashes = new SqliteFileHashStore(db, () => systemClock.now())
  const listStackingSuggestions = makeListStackingSuggestions({ frames, dismissals })
  const readSetting = db.prepare('SELECT value FROM app_settings WHERE key = ?')
  const tools = new NodeToolHub({ setting: key => (readSetting.get(key) as { value: string } | undefined)?.value ?? null })
  const planForward = makePlanForward({
    frames,
    positions: new SqliteTargetPositions(db),
    settings: new SqlitePlanningSettings(db),
    ephemeris: new AstronomyEngineEphemeris(),
    clock: systemClock
  })
  return {
    listStackingSuggestions,
    listNextActions: makeListNextActions({
      listStackingSuggestions,
      planForward,
      onPlanError: error => console.error('Forward planning failed; showing stacking suggestions only', error)
    }),
    dismissSuggestion: makeDismissSuggestion({ frames, dismissals, clock: systemClock }),
    discoverTargets: makeDiscoverTargets({ frames }),
    discoverTarget: makeDiscoverTarget({ frames }),
    reportHiddenData: makeReportHiddenData({ frames, hashes }),
    findDuplicates: makeFindDuplicates({ files: new SqliteFileIndex(db), hasher: new NodeContentHasher(), hashes }),
    prepareSirilWorkspace: makePrepareSirilWorkspace({ workspace: new NodeSirilWorkspace(db) }),
    estimateSirilRun: makeEstimateSirilRun({ workspace: new NodeSirilWorkspace(db) }),
    planForward,
    listTools: makeListTools({ tools }),
    planPostProcessing: makePlanPostProcessing({ stacks: new SqliteStackCatalogue(db), tools, workspace: new NodeSirilWorkspace(db) })
  }
}

export type Core = ReturnType<typeof composeCore>
