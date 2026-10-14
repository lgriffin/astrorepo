import {
  VESPERA_DARKS_FOLDER,
  VESPERA_MAX_DEPTH,
  copyPace,
  copySpace,
  isSafeRemoteName,
  landingTarget,
  observationOf,
  observationStatuses,
  partsKey,
  planCopies,
  plannedFiles,
  remotePath,
  sortObservations,
  surveyChoices,
  surveyFolders,
  vesperaRoots,
  type CopyChoice,
  type CopyPace,
  type LandingSizes,
  type ListedTree,
  type Observation,
  type ObservationStatus,
  type PlannedCopy,
  type SpaceVerdict,
  type VesperaFormat
} from '@astro/domain'
import type { Clock } from '../ports/clock'
import { CopyCancelledError, type LandingArea, type ScopeConnection, type ScopeFiles } from '../ports/scope'

/** Where the scope is, where copies land and which kinds of file to copy (from Settings). */
export interface VesperaRequest {
  host: string
  port: number
  landingRoot: string | null
  formats: VesperaFormat[]
}

/** What the scope holds, observation by observation, against what the PC already has. */
export interface VesperaSurvey {
  host: string
  port: number
  landingRoot: string | null
  observations: ObservationStatus[]
  newFiles: number
  newBytes: number
  /** Room for every new file on the landing disk; null when there is nowhere to land. */
  space: SpaceVerdict | null
}

export type CopyState = 'idle' | 'connecting' | 'copying' | 'done' | 'failed' | 'cancelled'

/** The copy under way or last run, as the control page polls it. */
export interface CopyProgress {
  state: CopyState
  startedAt: Date | null
  finishedAt: Date | null
  landingRoot: string | null
  /** The target folders the copy writes into. */
  targets: string[]
  totalFiles: number
  doneFiles: number
  /** Files already on the PC, or left alone because a different file has their name. */
  skippedFiles: number
  totalBytes: number
  doneBytes: number
  /** The file being copied, as its path under the landing root. */
  current: string | null
  pace: CopyPace
  /** Why the copy failed, in the scope's or the disk's own words. */
  error: string | null
  /** How many more bytes the landing disk needed, when that is why it failed. */
  shortBytes: number | null
}

export type StartResult = { started: true } | { started: false; reason: string }

export interface VesperaControl {
  /**
   * Connects, lists every observation and closes. Refused while a copy or another survey runs (one
   * connection at a time); a copy cannot start while a survey runs.
   */
  survey(request: VesperaRequest): Promise<VesperaSurvey>
  /** Starts copying the chosen observations in the background; progress() follows it. */
  start(request: VesperaRequest, choices: CopyChoice[]): StartResult
  progress(): CopyProgress
  /** Stops the copy at its next chunk; files already copied stay. False when nothing runs. */
  cancel(): boolean
  /** Settles when the copy under way (if any) has ended; for hosts and tests. */
  settled(): Promise<void>
}

export interface VesperaControlDeps {
  scope: ScopeFiles
  landing: LandingArea
  clock: Clock
  /**
   * Called once a copy that brought files in has finished, with the landing root and the target
   * folders it wrote into, so the host can index them (VSP-008). Errors are the host's to report.
   */
  onCopied?: (landingRoot: string, targets: string[]) => Promise<void> | void
}

/** Every file under a folder on the scope, at most VESPERA_MAX_DEPTH folders down. */
async function walk(conn: ScopeConnection, dir: string): Promise<ListedTree> {
  const out: ListedTree = []
  const pending: { dir: string; prefix: string; depth: number }[] = [{ dir, prefix: '', depth: 1 }]
  while (pending.length > 0) {
    const next = pending.shift()!
    for (const entry of await conn.list(next.dir)) {
      if (!isSafeRemoteName(entry.name)) continue
      const relative = next.prefix ? `${next.prefix}/${entry.name}` : entry.name
      if (entry.kind === 'file') out.push({ relative, entry })
      else if (next.depth < VESPERA_MAX_DEPTH) pending.push({ dir: remotePath(next.dir, entry.name), prefix: relative, depth: next.depth + 1 })
    }
  }
  return out
}

/** The observations on the scope (all, or only those `only` names) with every file under each. */
async function readObservations(conn: ScopeConnection, only?: CopyChoice[]): Promise<Observation[]> {
  const roots = vesperaRoots(await conn.list('/'))
  if (!roots.user && !roots.darks) {
    throw new Error(`The scope answered but has no "user" or "${VESPERA_DARKS_FOLDER}" folder, so it holds no observations the app knows how to read.`)
  }
  const wanted = (kind: Observation['kind'], folder: string) => !only || only.some(c => c.kind === kind && c.folder === folder)
  const out: Observation[] = []
  if (roots.user) {
    const user = remotePath(roots.user)
    for (const folder of surveyFolders(await conn.list(user))) {
      if (wanted('observation', folder)) out.push(observationOf('observation', user, folder, await walk(conn, remotePath(user, folder))))
    }
  }
  if (roots.darks && wanted('darks', roots.darks)) {
    out.push(observationOf('darks', '/', roots.darks, await walk(conn, remotePath(roots.darks))))
  }
  return sortObservations(out)
}

const idle = (): CopyProgress => ({
  state: 'idle',
  startedAt: null,
  finishedAt: null,
  landingRoot: null,
  targets: [],
  totalFiles: 0,
  doneFiles: 0,
  skippedFiles: 0,
  totalBytes: 0,
  doneBytes: 0,
  current: null,
  pace: copyPace(0, 0, 0),
  error: null,
  shortBytes: null
})

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * The Vespera control page (spec 033): lists what the scope holds and copies the observations
 * the user picks into the landing folder, one file at a time, never overwriting a file and never
 * changing anything on the scope. One copy at a time; it can be cancelled, and a copy that stops
 * part way is picked up where it left off by copying again, since files already copied are skipped.
 */
export function makeVesperaControl(deps: VesperaControlDeps): VesperaControl {
  let state = idle()
  let running: Promise<void> | null = null
  let cancelRequested = false
  let surveying = false
  /** Bytes of the file being copied that have arrived so far. */
  let partial = 0

  const busy = () => state.state === 'connecting' || state.state === 'copying'

  async function landingSizes(root: string, planned: PlannedCopy[]): Promise<LandingSizes> {
    const sizes = await deps.landing.sizes(planned.map(p => deps.landing.join(root, p.parts)))
    return new Map(planned.map((p, i) => [partsKey(p.parts), sizes[i]]))
  }

  async function run(request: VesperaRequest & { landingRoot: string }, choices: CopyChoice[]): Promise<void> {
    let conn: ScopeConnection | null = null
    // The end state is held back until the connection is closed and indexing has begun, so the
    // page, which stops following once the copy is not running, never misses the indexing.
    let end: Pick<CopyProgress, 'state' | 'error' | 'shortBytes'>
    try {
      conn = await deps.scope.open(request.host, request.port)
      const observations = await readObservations(conn, choices)
      const planned = plannedFiles(observations, choices, request.formats)
      const plan = planCopies(planned, await landingSizes(request.landingRoot, planned))
      const space = copySpace(plan, await deps.landing.freeBytes(request.landingRoot))
      state = {
        ...state,
        state: 'copying',
        targets: [...new Set(choices.flatMap(c => observations.filter(o => o.folder === c.folder && o.kind === c.kind).map(o => landingTarget(o, c.target))))],
        totalFiles: plan.copies.length,
        skippedFiles: plan.skipped.length,
        totalBytes: plan.bytes
      }
      if (!space.fits) {
        end = { state: 'failed', error: 'The folder copies land in has too little room for them.', shortBytes: space.shortBytes }
      } else {
        for (const copy of plan.copies) {
          if (cancelRequested) throw new CopyCancelledError()
          state = { ...state, current: partsKey(copy.parts) }
          partial = 0
          const got = await conn.download(
            copy.remote,
            deps.landing.join(request.landingRoot, copy.parts),
            copy.sizeBytes,
            received => void (partial = received),
            () => cancelRequested
          )
          partial = 0
          state = { ...state, doneFiles: state.doneFiles + 1, doneBytes: state.doneBytes + (copy.sizeBytes ?? got) }
        }
        end = { state: 'done', error: null, shortBytes: null }
      }
    } catch (error) {
      partial = 0
      end = error instanceof CopyCancelledError || cancelRequested
        ? { state: 'cancelled', error: null, shortBytes: null }
        : { state: 'failed', error: messageOf(error), shortBytes: null }
    }
    await conn?.close()
    let indexing: Promise<void> | void = undefined
    if (state.doneFiles > 0) {
      try {
        indexing = deps.onCopied?.(request.landingRoot, state.targets)
      } catch {
        // Indexing the copies is the host's to report; the copy itself is done.
      }
    }
    state = { ...state, ...end, current: end.state === 'failed' ? state.current : null, finishedAt: deps.clock.now() }
    await Promise.resolve(indexing).catch(() => undefined)
  }

  return {
    async survey(request) {
      if (busy()) throw new Error('A copy is under way; the list refreshes when it ends.')
      if (surveying) throw new Error('The scope is already being read.')
      surveying = true
      try {
        const conn = await deps.scope.open(request.host, request.port)
        try {
          const observations = await readObservations(conn)
          const root = request.landingRoot
          const landed = root
            ? await Promise.all((await deps.landing.folders(root)).map(async target => ({ target, folders: await deps.landing.folders(deps.landing.join(root, [target])) })))
            : []
          const choices = surveyChoices(observations, landed)
          const planned = plannedFiles(observations, choices, request.formats)
          const have = root ? await landingSizes(root, planned) : new Map<string, number | null>()
          const plan = planCopies(planned, have)
          return {
            host: request.host,
            port: request.port,
            landingRoot: root,
            observations: observationStatuses(observations, choices, request.formats, have),
            newFiles: plan.copies.length,
            newBytes: plan.bytes,
            space: root ? copySpace(plan, await deps.landing.freeBytes(root)) : null
          }
        } finally {
          await conn.close()
        }
      } finally {
        surveying = false
      }
    },

    start(request, choices) {
      if (busy()) return { started: false, reason: 'A copy is already under way.' }
      if (surveying) return { started: false, reason: 'The scope is still being read; copy once its list is shown.' }
      const landingRoot = request.landingRoot
      if (!landingRoot) return { started: false, reason: 'Choose the folder copies land in first.' }
      if (choices.length === 0) return { started: false, reason: 'Pick at least one observation to copy.' }
      cancelRequested = false
      state = { ...idle(), state: 'connecting', startedAt: deps.clock.now(), landingRoot }
      running = run({ ...request, landingRoot }, choices).finally(() => void (running = null))
      return { started: true }
    },

    progress() {
      const done = state.doneBytes + partial
      const elapsed = state.startedAt ? (state.finishedAt ?? deps.clock.now()).getTime() - state.startedAt.getTime() : 0
      return { ...state, doneBytes: done, pace: copyPace(done, state.totalBytes, elapsed) }
    },

    cancel() {
      if (!busy()) return false
      cancelRequested = true
      return true
    },

    async settled() {
      await running
    }
  }
}
