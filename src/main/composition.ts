import type Database from 'better-sqlite3'
import type { Worker } from 'worker_threads'
import {
  makeDiscoverTarget,
  makeDiscoverTargets,
  makeDismissSuggestion,
  makeEstimateSirilRun,
  makeFrameGrading,
  makeFindDuplicates,
  makeJobScheduler,
  makeListNextActions,
  makeListStackingSuggestions,
  makeListTools,
  makePlanPostProcessing,
  makePlanForward,
  makePrepareSirilWorkspace,
  makeQueuePostProcess,
  makeQueueStack,
  makeReportHiddenData,
  type JobScheduler
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
import { SqliteJobSettings, SqliteJobStore } from './adapters/sqlite-jobs'
import { NodeProcessRunner } from './adapters/node-process-runner'
import { FileJobLogs } from './adapters/file-job-logs'
import { NodeMachineMonitor } from './adapters/node-machine-monitor'
import { SqliteFrameGradeStore, SqliteGradeLimits } from './adapters/sqlite-frame-grades'
import { NodeFrameMeasurer } from './adapters/node-frame-measurer'
import { NodeMemoryProbe } from './adapters/node-memory-probe'

/** One measurer for the app, so every request shares its worker thread. */
let frameMeasurer = new NodeFrameMeasurer()

/** Measures on worker threads from now on (NFR-014). The app calls this at start; tests measure in place. */
export function measureOnWorkers(createWorker: () => Worker): NodeFrameMeasurer {
  frameMeasurer = new NodeFrameMeasurer(createWorker)
  return frameMeasurer
}

/** Frame grading over the index and the FITS files (spec 019). */
export function composeGrading(db: Database.Database) {
  return makeFrameGrading({ store: new SqliteFrameGradeStore(db), measurer: frameMeasurer, limits: new SqliteGradeLimits(db), clock: systemClock })
}

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
  const stacks = new SqliteStackCatalogue(db)
  const jobStore = new SqliteJobStore(db)
  const grading = composeGrading(db)
  const estimateSirilRun = makeEstimateSirilRun({ workspace: new NodeSirilWorkspace(db), selection: grading, memory: new NodeMemoryProbe() })
  const planPostProcessing = makePlanPostProcessing({ stacks, tools, workspace: new NodeSirilWorkspace(db) })
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
    prepareSirilWorkspace: makePrepareSirilWorkspace({ workspace: new NodeSirilWorkspace(db), selection: grading }),
    grading,
    estimateSirilRun,
    planForward,
    listTools: makeListTools({ tools }),
    planPostProcessing,
    queueStack: makeQueueStack({ estimate: estimateSirilRun, tools, stacks, store: jobStore, clock: systemClock }),
    queuePostProcess: makeQueuePostProcess({ plan: planPostProcessing, tools, store: jobStore, clock: systemClock })
  }
}

export interface JobsHostOptions {
  /** Folder for job logs. */
  logsDir: string
  /** Seconds since the last keyboard or mouse input (Electron's powerMonitor). */
  userIdleSeconds: () => number | null
  readOnlyDirs: () => string[]
  onChange: () => void
}

/** The job runner: one per app, since it holds the running process. */
export function composeJobs(db: Database.Database, options: JobsHostOptions): JobScheduler {
  const workspace = new NodeSirilWorkspace(db)
  return makeJobScheduler({
    store: new SqliteJobStore(db),
    settings: new SqliteJobSettings(db),
    machine: new NodeMachineMonitor({ userIdleSeconds: options.userIdleSeconds }),
    runner: new NodeProcessRunner(),
    logs: new FileJobLogs(options.logsDir),
    workspace,
    prepare: makePrepareSirilWorkspace({ workspace, selection: composeGrading(db) }),
    readOnlyDirs: options.readOnlyDirs,
    clock: systemClock,
    onChange: options.onChange
  })
}

export type Core = ReturnType<typeof composeCore>
