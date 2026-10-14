import os from 'os'
import path from 'path'
import type Database from 'better-sqlite3'
import type { Worker } from 'worker_threads'
import {
  makeArchiveTarget,
  makeTargetHolds,
  makeDiscoverTarget,
  makeDiscoverTargets,
  makeDismissSuggestion,
  makeEstimateSirilRun,
  sourceLightPaths,
  makeFrameGrading,
  makeGallery,
  makeFindDuplicates,
  makeJobScheduler,
  makeListNextActions,
  makeListStackingSuggestions,
  makeCheckToolHealth,
  makeListSyqonModels,
  makeSyqonModelCache,
  makeListTools,
  makePlanPostProcessing,
  makePlanSyqon,
  makePlanForward,
  makePrepareSirilWorkspace,
  makeQueuePostProcess,
  makeQueueStack,
  makeQueueSyqon,
  makeReportHiddenData,
  makeDescribeTargetGeometry,
  makeExportMosaicCsv,
  makeListMosaicGaps,
  makePlanMosaic,
  makePreferredSolver,
  makeQueueSolves,
  makeRunSolveJob,
  makeSaveMosaicPlan,
  makePlanComet,
  makeSetCometOrbit,
  makePictureGallery,
  type Gallery,
  type PictureGallery,
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
import { NodeRunArea } from './adapters/node-run-area'
import { NodeArchiveArea } from './adapters/node-archive-area'
import { SqliteArchiveStore } from './adapters/sqlite-archive-store'
import { NodeToolProbe } from './adapters/node-tool-probe'
import { WindowsAppPathsRegistry } from './adapters/windows-app-paths'
import { SqliteMosaicStore, SqliteSolveStore } from './adapters/sqlite-sky-geometry'
import { AstapPlateSolver, SirilPlateSolver } from './adapters/node-plate-solvers'
import { NodeImagePixels } from './adapters/node-image-pixels'
import { SqliteGalleryCatalogue, SqlitePaletteStore } from './adapters/sqlite-gallery'
import { SqliteCometStore } from './adapters/sqlite-comet-store'
import { settingReader } from './adapters/shared/app-settings'
import { AppFolders } from './adapters/app-folders'
import { NodePictureFolder, type PictureShrinker } from './adapters/node-picture-folder'
import { SqliteObjectCatalogue } from './adapters/sqlite-object-catalogue'

/** The app's clock, for hosts that stamp what they show (the IPC handlers). */
export const clock = systemClock

/** ASTAP first, Siril's own solver as the fallback (specs/024-sky-geometry). */
const plateSolvers = () => [new AstapPlateSolver(), new SirilPlateSolver()]

/** The app's data folder; the app sets it at start, tests leave the temporary default. */
let appDataDir = path.join(os.tmpdir(), 'astrorepo')

/** Puts the work area's default and the job logs under the app's data folder. The app calls this at start. */
export function useAppData(dir: string): void {
  appDataDir = dir
}

/** Where the app reads and writes: read-only folders, the work area and the archive. */
export function composeFolders(db: Database.Database): AppFolders {
  return new AppFolders(db, appDataDir)
}

/** One measurer for the app, so every request shares its worker thread. */
let frameMeasurer = new NodeFrameMeasurer()

/** Targets an archive is working on, shared by every composition so the job runner waits for it (ARC-008). */
export const targetHolds = makeTargetHolds()

/** SyQon's model list, reused for two minutes per syqon-cli path; a health check in Settings lists afresh. */
const syqonModels = makeSyqonModelCache(() => systemClock.now().getTime(), 2 * 60_000)

/** One registry reader for the app, so its short-lived lookups are shared across calls. */
const appPaths = new WindowsAppPathsRegistry()

/** Measures on worker threads from now on (NFR-014). The app calls this at start; tests measure in place. */
export function measureOnWorkers(createWorker: () => Worker): NodeFrameMeasurer {
  frameMeasurer = new NodeFrameMeasurer(createWorker)
  return frameMeasurer
}

/** One pixel reader for the app, so the inspector's requests share its worker thread. */
let imagePixels = new NodeImagePixels()

/** Reads images for the inspector on a worker thread from now on (NFR-019). The app calls this at start; tests read in place. */
export function inspectOnWorkers(createWorker: () => Worker): NodeImagePixels {
  imagePixels = new NodeImagePixels(createWorker)
  return imagePixels
}

/** The gallery last composed, kept while the database and pixel reader stay the same. */
let gallery: { db: Database.Database; pixels: NodeImagePixels; gallery: Gallery } | null = null

/**
 * The image inspector, palettes and compare view over the index and the image files (spec 025).
 * One per database handle and pixel reader, so the catalogue it labels overlays from is read once;
 * a new handle (a reset) or inspectOnWorkers composes it afresh.
 */
export function composeGallery(db: Database.Database): Gallery {
  if (gallery?.db !== db || gallery.pixels !== imagePixels) {
    const made = makeGallery({
      pixels: imagePixels,
      catalogue: new SqliteGalleryCatalogue(db),
      palettes: new SqlitePaletteStore(db),
      clock: systemClock,
      solves: new SqliteSolveStore(db)
    })
    gallery = { db, pixels: imagePixels, gallery: made }
  }
  return gallery.gallery
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
  const hashes = new SqliteFileHashStore(db, systemClock)
  const archives = new SqliteArchiveStore(db)
  const listStackingSuggestions = makeListStackingSuggestions({ frames, dismissals, archives })
  const setting = settingReader(db)
  const tools = new NodeToolHub({
    setting,
    registry: appPaths
  })
  const probe = new NodeToolProbe()
  const stacks = new SqliteStackCatalogue(db)
  const jobStore = new SqliteJobStore(db)
  const grading = composeGrading(db)
  const estimateSirilRun = makeEstimateSirilRun({ workspace: new NodeSirilWorkspace(db), selection: grading, memory: new NodeMemoryProbe() })
  const planPostProcessing = makePlanPostProcessing({ stacks, tools, workspace: new NodeSirilWorkspace(db) })
  const planSyqon = makePlanSyqon({ stacks, tools, workspace: new NodeSirilWorkspace(db), models: makeListSyqonModels({ tools, probe, cache: syqonModels }) })
  const planningSettings = new SqlitePlanningSettings(db)
  const ephemeris = new AstronomyEngineEphemeris()
  const planForward = makePlanForward({
    frames,
    positions: new SqliteTargetPositions(db),
    settings: planningSettings,
    ephemeris,
    clock: systemClock
  })
  const solves = new SqliteSolveStore(db)
  const mosaics = new SqliteMosaicStore(db, systemClock)
  const sky = { store: solves, mosaics, settings: planningSettings, ephemeris, clock: systemClock }
  const folders = composeFolders(db)
  const planMosaic = makePlanMosaic(sky)
  const comets = new SqliteCometStore(db, systemClock)
  return {
    listStackingSuggestions,
    listNextActions: makeListNextActions({
      listStackingSuggestions,
      planForward,
      listMosaicGaps: makeListMosaicGaps(sky),
      onPlanError: error => console.error('Forward planning failed; showing stacking suggestions only', error)
    }),
    dismissSuggestion: makeDismissSuggestion({ frames, dismissals, clock: systemClock }),
    discoverTargets: makeDiscoverTargets({ frames }),
    discoverTarget: makeDiscoverTarget({ frames }),
    reportHiddenData: makeReportHiddenData({ frames, hashes }),
    findDuplicates: makeFindDuplicates({ files: new SqliteFileIndex(db), hasher: new NodeContentHasher(), hashes }),
    prepareSirilWorkspace: makePrepareSirilWorkspace({ workspace: new NodeSirilWorkspace(db), selection: grading }),
    grading,
    /** Leaves one night of a stack's source folder out, or uses it again (ADV-008). */
    leaveOutNight: async (sourceDir: string, night: string, leftOut: boolean) =>
      grading.setNightLeftOut(await sourceLightPaths(new NodeSirilWorkspace(db), sourceDir), night, leftOut),
    estimateSirilRun,
    planForward,
    listTools: makeListTools({ tools }),
    /** Runs each tool's version flag and SyQon's model list (NFR-017). */
    checkToolHealth: makeCheckToolHealth({ tools, probe, cache: syqonModels }),
    planPostProcessing,
    planSyqon,
    windows: tools.windows,
    queueStack: makeQueueStack({ estimate: estimateSirilRun, tools, stacks, store: jobStore, clock: systemClock }),
    queuePostProcess: makeQueuePostProcess({ plan: planPostProcessing, tools, store: jobStore, clock: systemClock }),
    archive: makeArchiveTarget({
      holds: targetHolds,
      area: new NodeArchiveArea(),
      store: archives,
      frames,
      stacks,
      jobs: jobStore,
      workspace: new NodeSirilWorkspace(db),
      clock: systemClock
    }),
    queueSyqon: makeQueueSyqon({ plan: planSyqon, store: jobStore, clock: systemClock }),
    queueSolves: makeQueueSolves({
      store: solves,
      mosaics,
      preferred: makePreferredSolver({ tools, solvers: plateSolvers() }),
      jobs: jobStore,
      clock: systemClock,
      workDir: id => folders.solveWorkDir(id)
    }),
    describeTargetGeometry: makeDescribeTargetGeometry({ store: solves, mosaics }),
    planMosaic,
    saveMosaicPlan: makeSaveMosaicPlan({ store: solves, mosaics, clock: systemClock }),
    exportMosaicCsv: makeExportMosaicCsv(planMosaic),
    setCometOrbit: makeSetCometOrbit({ comets }),
    planComet: makePlanComet({ comets, workspace: new NodeSirilWorkspace(db), selection: grading, ephemeris, settings: planningSettings, targets: stacks })
  }
}

export interface JobsHostOptions {
  /** Folder for job logs. */
  logsDir: string
  /** Seconds since the last keyboard or mouse input (Electron's powerMonitor). */
  userIdleSeconds: () => number | null
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
    runArea: new NodeRunArea(),
    targetName: async id => (await new SqliteStackCatalogue(db).describeTarget(id))?.name ?? null,
    readOnlyDirs: () => composeFolders(db).readOnlyDirs(),
    clock: systemClock,
    solve: makeRunSolveJob({ solvers: plateSolvers(), store: new SqliteSolveStore(db), clock: systemClock }),
    onChange: options.onChange,
    holds: targetHolds
  })
}

export type Core = ReturnType<typeof composeCore>

/** Shrinks gallery pictures before they go to the window (NFR-021); the app sets Electron's decoder at start. */
let pictureShrinker: PictureShrinker | null = null

/** The gallery last composed, kept so a thumbnail is checked against the last listing without walking the folder again. */
let pictureGallery: { db: Database.Database; shrinker: PictureShrinker | null; gallery: PictureGallery } | null = null

/** Shrinks gallery pictures with this from now on. The app calls this at start; tests send pictures whole. */
export function shrinkPicturesWith(shrink: PictureShrinker): void {
  pictureShrinker = shrink
}

/** The gallery of finished pictures (spec 031), one per database handle and shrinker. */
export function composePictureGallery(db: Database.Database): PictureGallery {
  if (pictureGallery?.db !== db || pictureGallery.shrinker !== pictureShrinker) {
    const made = makePictureGallery({
      folder: new NodePictureFolder(settingReader(db), pictureShrinker),
      catalogue: new SqliteObjectCatalogue(db),
      planning: new SqlitePlanningSettings(db)
    })
    pictureGallery = { db, shrinker: pictureShrinker, gallery: made }
  }
  return pictureGallery.gallery
}
