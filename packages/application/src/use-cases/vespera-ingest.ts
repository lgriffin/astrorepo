import {
  buildSession,
  bytesText,
  canTransfer,
  copyPace,
  DEFAULT_INCLUDE,
  destinationFolderName,
  findUserFolder,
  folderTarget,
  INCLUDED_KINDS,
  inventorySession,
  MANIFEST_FILE,
  nameCountFinding,
  PART_SUFFIX,
  planCounts,
  planTransfer,
  recordSessionId,
  resolveTarget,
  SIZE_ATTEMPTS,
  targetFromObservationJson,
  sessionFolders,
  sortSessions,
  TRANSFER_FILE,
  transferRoom,
  type CopyPace,
  type Finding,
  type IncludedKind,
  type IngestTarget,
  type ListedRun,
  type ManifestFile,
  type TargetClue,
  type TransferItem,
  type TransferJob,
  type TransferManifest,
  type VesperaInventory,
  type VesperaSession
} from '@astro/domain'
import type { Clock } from '../ports/clock'
import type { ContentHasher } from '../ports/file-hashing'
import { ScopeDisconnectedError, type IngestDisk, type VesperaMetadata, type VesperaScope, type VesperaTransferStore } from '../ports/vespera-ingest'

/** The scope is not laid out the way a Vespera's is: it has no user/ folder. */
export class ScopeLayoutError extends Error {
  constructor() {
    super('The scope has no user folder, so it does not look like a Vespera. Is the computer on the scope\'s Wi-Fi?')
    this.name = 'ScopeLayoutError'
  }
}

// ── Scan ────────────────────────────────────────────────────────────────

export interface ScannedSession {
  session: VesperaSession
  inventory: VesperaInventory
}

export interface VesperaScan {
  /** The sessions folder as the scope spells it. */
  userFolder: string
  /** Newest first. */
  sessions: ScannedSession[]
  /** The scope keeps calibration darks from expert mode; they are listed, never copied. */
  expertMode: boolean
}

export interface ScanProgress {
  listed: number
  of: number
}

/** Lists one session folder and its runs: directory listings only, never a file's bytes. */
export async function listVesperaSession(scope: VesperaScope, userFolder: string, id: string, clock: Clock): Promise<VesperaSession> {
  const sessionPath = `${userFolder}/${id}`
  const top = await scope.list(sessionPath)
  const runs: ListedRun[] = []
  for (const dir of top.filter(e => e.type === 'dir')) runs.push({ folder: dir.name, entries: await scope.list(`${sessionPath}/${dir.name}`) })
  return buildSession(id, top, runs, clock.now())
}

/**
 * Scans the scope: lists user/ and every session in it, one listing at a time (the scope's FTP
 * server is small and its Wi-Fi drops under load), and counts what each holds. Downloads nothing.
 */
export function makeScanVespera(deps: { scope: VesperaScope; clock: Clock }) {
  return async (onProgress?: (p: ScanProgress) => void): Promise<VesperaScan> => {
    const userFolder = findUserFolder(await deps.scope.list(''))
    if (userFolder === null) throw new ScopeLayoutError()
    const entries = await deps.scope.list(userFolder)
    const ids = sessionFolders(entries)
    const sessions: VesperaSession[] = []
    onProgress?.({ listed: 0, of: ids.length })
    for (const id of ids) {
      sessions.push(await listVesperaSession(deps.scope, userFolder, id, deps.clock))
      onProgress?.({ listed: sessions.length, of: ids.length })
    }
    return {
      userFolder,
      sessions: sortSessions(sessions).map(session => ({ session, inventory: inventorySession(session) })),
      expertMode: entries.some(e => e.type === 'dir' && e.name.toLowerCase() === 'expert-mode')
    }
  }
}

// ── Target ──────────────────────────────────────────────────────────────

/** How much of a file is read for a name: observation.json whole, a JPEG's EXIF, a FITS header's first ten blocks. */
export const HEAD_BYTES = { observationJson: 256 * 1024, exif: 128 * 1024, fitsHeader: 2880 * 10 } as const

export interface IdentifyOptions {
  /** Also read observation.json when the folder already named the target, to catch a disagreement. */
  crossCheck?: boolean
}

/**
 * Names a session's target, cheapest clue first, and stops at the first that names one: the
 * folder's label (free), observation.json (one small read), the last stacked JPEG's EXIF (once the
 * first two fail), then the first FITS frame's OBJECT card. Each read competes with the copy for
 * the scope's Wi-Fi, so nothing is read that is not needed.
 */
export function makeIdentifyTarget(deps: { scope: VesperaScope; metadata: VesperaMetadata }) {
  const text = (bytes: Uint8Array) => new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  return async (session: VesperaSession, userFolder: string, options: IdentifyOptions = {}): Promise<{ target: IngestTarget; findings: Finding[] }> => {
    const base = `${userFolder}/${session.id}`
    const clues: TargetClue[] = [{ source: 'folder', raw: session.rawLabel }]
    const named = () => resolveTarget(clues).target.confidence !== 'unknown'

    const readObservation = async () => {
      if (!session.observationJson) return
      clues.push({ source: 'observation-json', raw: targetFromObservationJson(text(await deps.scope.head(`${base}/${session.observationJson}`, HEAD_BYTES.observationJson))) })
    }

    if (!named() || options.crossCheck) await readObservation()
    if (!named()) {
      const lastImages = [...session.runs].reverse().find(r => r.stage === 'images' && r.files.some(f => f.kind === 'jpeg' && f.role === 'output'))
      const jpeg = lastImages?.files.filter(f => f.kind === 'jpeg' && f.role === 'output').sort((a, b) => (a.frameNo ?? 0) - (b.frameNo ?? 0)).at(-1)
      if (lastImages && jpeg) clues.push({ source: 'exif', raw: deps.metadata.exifDescription(await deps.scope.head(`${base}/${lastImages.folder}/${jpeg.name}`, HEAD_BYTES.exif)) })
    }
    if (!named()) {
      const run = session.runs.find(r => r.files.some(f => f.role === 'frame'))
      const fits = run?.files.filter(f => f.role === 'frame').sort((a, b) => (a.frameNo ?? 0) - (b.frameNo ?? 0))[0]
      if (run && fits) clues.push({ source: 'fits-header', raw: deps.metadata.fitsObject(await deps.scope.head(`${base}/${run.folder}/${fits.name}`, HEAD_BYTES.fitsHeader)) })
    }
    return resolveTarget(clues)
  }
}

// ── Plan ────────────────────────────────────────────────────────────────

export interface PlanRequest {
  session: VesperaSession
  userFolder: string
  target: IngestTarget
  /** Findings live when Transfer was pressed. */
  findings: Finding[]
  /** FITS and TIFF when not given (DEFAULT_INCLUDE). */
  include?: IncludedKind[]
  /** Where copies land; the session's folder goes in its target's folder there. */
  destinationRoot: string
  /** Take the next free _2, _3 … when the name is used by a different session. */
  allowDuplicate?: boolean
}

export type PlanResult =
  | { status: 'planned'; job: TransferJob }
  /** The folder already holds this session's copy: carry it on. */
  | { status: 'resume'; job: TransferJob }
  /** The folder holds a different session (or something astrorepo did not make); nothing was written. */
  | { status: 'refused'; finding: Finding; folder: string }
  /** The session has an error finding or no target; nothing was written. */
  | { status: 'blocked'; reason: string }

const parseJob = (text: string | null): TransferJob | null => {
  if (text === null) return null
  try {
    const job = JSON.parse(text) as TransferJob
    return typeof job?.id === 'string' && Array.isArray(job.items) && Array.isArray(job.committed) ? job : null
  } catch {
    return null
  }
}

/**
 * Plans one press of Transfer: names the destination folder from the target, the date and the
 * counts, and records the job in the store and in the folder before a byte is copied. A folder of
 * that name holding a different session is never merged into.
 */
export function makePlanVesperaTransfer(deps: { disk: IngestDisk; store: VesperaTransferStore; clock: Clock }) {
  return async (req: PlanRequest): Promise<PlanResult> => {
    if (!canTransfer(req.findings, req.target)) {
      return { status: 'blocked', reason: req.target.confidence === 'unknown' || req.target.review ? 'Name the target first.' : 'The session has an error finding; look at it first.' }
    }
    const include = INCLUDED_KINDS.filter(k => (req.include ?? DEFAULT_INCLUDE).includes(k))
    if (include.length === 0) return { status: 'blocked', reason: 'Choose at least one kind of file to copy.' }
    if (!req.session.startedAt) return { status: 'blocked', reason: 'The session has no date to name its folder by.' }
    const items = planTransfer(req.session, include)
    if (items.length === 0) return { status: 'blocked', reason: 'The session holds no files of the kinds chosen to copy.' }
    const counts = planCounts(items, include)
    const date = req.session.startedAt.slice(0, 10)
    const targetFolder = folderTarget(req.target)
    const parent = deps.disk.join(req.destinationRoot, targetFolder)

    for (let duplicate = 1; ; duplicate++) {
      const folder = destinationFolderName({ target: req.target, date, counts, ...(duplicate > 1 ? { duplicate } : {}) })
      const dir = deps.disk.join(parent, folder)
      if (await deps.disk.exists(dir)) {
        const transfer = await deps.disk.readText(deps.disk.join(dir, TRANSFER_FILE))
        const manifest = await deps.disk.readText(deps.disk.join(dir, MANIFEST_FILE))
        const owner = (transfer !== null ? recordSessionId(transfer) : null) ?? (manifest !== null ? recordSessionId(manifest) : null)
        if (owner === req.session.id) {
          const job = (await deps.store.get(dir)) ?? parseJob(transfer)
          if (job) return { status: 'resume', job }
        }
        if (req.allowDuplicate && owner !== req.session.id) continue
        return {
          status: 'refused',
          folder,
          finding: { level: 'error', code: 'DEST_EXISTS', message: `${folder} already exists in ${parent} and holds ${owner === null ? 'something astrorepo did not copy' : owner === req.session.id ? 'an unreadable copy of this session' : `another session (${owner})`}. Nothing was copied into it.` }
        }
      }
      const now = deps.clock.now().toISOString()
      const job: TransferJob = {
        id: dir,
        sessionId: req.session.id,
        sessionPath: `${req.userFolder}/${req.session.id}`,
        target: req.target,
        destinationRoot: req.destinationRoot,
        targetFolder,
        destinationFolder: folder,
        include,
        items,
        state: 'planned',
        committed: [],
        copiedBytes: 0,
        totalBytes: items.reduce((s, i) => s + i.sizeBytes, 0),
        findings: req.findings,
        reason: null,
        startedAt: req.session.startedAt,
        listedAt: req.session.listedAt.toISOString(),
        createdAt: now,
        updatedAt: now
      }
      await deps.store.save(job)
      await deps.disk.writeText(deps.disk.join(dir, TRANSFER_FILE), JSON.stringify(job, null, 2))
      return { status: 'planned', job }
    }
  }
}

// ── Copy ────────────────────────────────────────────────────────────────

export interface TransferProgress {
  job: TransferJob
  /** The file being copied, when one is. */
  current: string | null
}

export interface RunOptions {
  onProgress?: (p: TransferProgress) => void
  /** Checked between files: true pauses the job. */
  shouldPause?: () => boolean
}

const remoteOf = (job: TransferJob, item: TransferItem) => `${job.sessionPath}/${item.path}`

/**
 * Runs or resumes a transfer: copies each file not yet committed, one at a time, into a .part file
 * that is renamed only once its size matches the listing; checks the session again first when
 * resuming; hashes every copy and writes the manifest when all are in. A dropped link pauses the job,
 * it never fails it, and the scope is only read.
 */
export function makeRunVesperaTransfer(deps: { scope: VesperaScope; disk: IngestDisk; hasher: ContentHasher; store: VesperaTransferStore; clock: Clock }) {
  const save = async (job: TransferJob, patch: Partial<TransferJob>): Promise<TransferJob> => {
    const next = { ...job, ...patch, updatedAt: deps.clock.now().toISOString() }
    await deps.store.save(next)
    await deps.disk.writeText(deps.disk.join(next.id, TRANSFER_FILE), JSON.stringify(next, null, 2))
    return next
  }

  /** Copies one file into its .part and commits it; false when its size came out wrong every time. */
  const copyOne = async (job: TransferJob, item: TransferItem): Promise<boolean> => {
    const local = deps.disk.join(job.id, ...item.path.split('/'))
    if ((await deps.disk.size(local)) === item.sizeBytes) return true
    const part = `${local}${PART_SUFFIX}`
    for (let attempt = 1; attempt <= SIZE_ATTEMPTS; attempt++) {
      let have = attempt === 1 ? (await deps.disk.size(part)) ?? 0 : 0
      if (have > item.sizeBytes) have = 0
      if (have < item.sizeBytes) {
        const read = await deps.scope.read(remoteOf(job, item), have)
        const from = Math.min(read.from, have)
        const writer = await deps.disk.append(part, from)
        try {
          for await (const chunk of read.chunks) await writer.write(chunk)
        } finally {
          await writer.close()
        }
      }
      if ((await deps.disk.size(part)) === item.sizeBytes) {
        await deps.disk.rename(part, local)
        return true
      }
      await deps.disk.remove(part)
    }
    return false
  }

  return async (start: TransferJob, options: RunOptions = {}): Promise<TransferJob> => {
    let job = start
    if (job.state === 'done') return job
    const report = (current: string | null) => options.onProgress?.({ job, current })
    try {
      if (job.state === 'paused' || job.state === 'failed' || job.committed.length > 0) {
        const userFolder = job.sessionPath.slice(0, job.sessionPath.length - job.sessionId.length - 1)
        const now = await listVesperaSession(deps.scope, userFolder, job.sessionId, deps.clock)
        const fresh = new Map(planTransfer(now, job.include).map(i => [i.path, i.sizeBytes]))
        const added = [...fresh.keys()].filter(p => !job.items.some(i => i.path === p)).length
        const changed = job.items.filter(i => fresh.has(i.path) && fresh.get(i.path) !== i.sizeBytes).length
        if (added + changed > 0 && !job.findings.some(f => f.code === 'SESSION_GREW')) {
          const grew: Finding = { level: 'warn', code: 'SESSION_GREW', message: `The session changed since it was listed: ${added} new and ${changed} changed ${added + changed === 1 ? 'file' : 'files'}. This copy keeps to what was planned; plan another for the rest.` }
          const stale = nameCountFinding(job.destinationFolder, planCounts(planTransfer(now, job.include), job.include))
          job = await save(job, { findings: [...job.findings, grew, ...(stale ? [stale] : [])] })
        }
      }
      // A .part already on the disk counts towards its file, as the copy carries on from it.
      let toCopy = 0
      for (const item of job.items) {
        if (job.committed.includes(item.path)) continue
        const local = deps.disk.join(job.id, ...item.path.split('/'))
        if ((await deps.disk.size(local)) === item.sizeBytes) continue
        toCopy += item.sizeBytes - Math.min(item.sizeBytes, (await deps.disk.size(`${local}${PART_SUFFIX}`)) ?? 0)
      }
      const room = transferRoom(toCopy, await deps.disk.freeBytes(job.id))
      if (room.shortBytes !== null) {
        const short: Finding = { level: 'error', code: 'SPACE_SHORT', message: `Nothing more was copied: the folder copies land in needs ${bytesText(room.shortBytes)} more room.` }
        return await save(job, { state: 'paused', reason: short.message, findings: [...job.findings.filter(f => f.code !== 'SPACE_SHORT'), short] })
      }
      job = await save(job, { state: 'running', reason: null, findings: job.findings.filter(f => f.code !== 'SPACE_SHORT') })
      report(null)
      for (const item of job.items) {
        if (job.committed.includes(item.path)) continue
        if (options.shouldPause?.()) return await save(job, { state: 'paused', reason: 'Paused.' })
        report(item.path)
        if (!(await copyOne(job, item))) {
          const finding: Finding = { level: 'warn', code: 'SIZE_MISMATCH', message: `${item.path} came out the wrong size ${SIZE_ATTEMPTS} times.` }
          return await save(job, { state: 'paused', reason: finding.message, findings: [...job.findings, finding] })
        }
        job = await save(job, { committed: [...job.committed, item.path], copiedBytes: job.copiedBytes + item.sizeBytes })
        report(null)
      }

      job = await save(job, { state: 'verifying' })
      const files: ManifestFile[] = []
      for (const item of job.items) {
        const local = deps.disk.join(job.id, ...item.path.split('/'))
        const size = await deps.disk.size(local)
        if (size !== item.sizeBytes) {
          const done = job.committed.filter(p => p !== item.path)
          return await save(job, { state: 'paused', committed: done, copiedBytes: done.reduce((s, p) => s + (job.items.find(i => i.path === p)?.sizeBytes ?? 0), 0), reason: `${item.path} is missing or the wrong size on the destination.` })
        }
        files.push({ remote: remoteOf(job, item), local: item.path, sizeBytes: size, sha256: (await deps.hasher.fullHash(local)).replace(/^sha256:/, '') })
      }
      const counts = planCounts(job.items, job.include)
      const manifest: TransferManifest = {
        schema: 1,
        sessionId: job.sessionId,
        target: job.target,
        folder: job.destinationFolder,
        include: job.include,
        counts,
        files,
        findings: job.findings,
        startedAt: job.startedAt,
        copiedAt: deps.clock.now().toISOString()
      }
      await deps.disk.writeText(deps.disk.join(job.id, MANIFEST_FILE), JSON.stringify(manifest, null, 2))
      job = await save(job, { state: 'done' })
      report(null)
      return job
    } catch (e) {
      if (e instanceof ScopeDisconnectedError) return save(job, { state: 'paused', reason: e.message })
      return save(job, { state: 'failed', reason: e instanceof Error ? e.message : String(e) })
    }
  }
}

// ── Copy queue ──────────────────────────────────────────────────────────

/** What became of one session of a queue. `refused`: its folder name is another session's. */
export interface QueueOutcome {
  sessionId: string
  level: 'info' | 'warn' | 'error'
  refused: boolean
  message: string
  job: TransferJob | null
}

/** One session to copy: how to plan it, when its turn comes. */
export interface QueueItem {
  sessionId: string
  plan: () => Promise<PlanResult>
}

export interface QueueState {
  /** Copying, or planning the next session: the scope's one connection is in use. */
  busy: boolean
  job: TransferJob | null
  current: string | null
  pace: CopyPace | null
  /** Which session is under way (1-based) of how many. */
  position: number
  total: number
  outcomes: QueueOutcome[]
}

export type QueueStart = { started: true } | { started: false; reason: string }

function outcomeOf(job: TransferJob): QueueOutcome {
  const files = job.items.length
  if (job.state === 'done') {
    return { sessionId: job.sessionId, level: 'info', refused: false, job, message: `Copied ${files} ${files === 1 ? 'file' : 'files'} (${bytesText(job.totalBytes)}) into ${job.targetFolder}/${job.destinationFolder}.` }
  }
  if (job.state === 'paused') {
    return { sessionId: job.sessionId, level: 'warn', refused: false, job, message: `${job.destinationFolder} is paused after ${job.committed.length} of ${files} files: ${job.reason ?? 'Paused.'} Resume carries on from there.` }
  }
  return { sessionId: job.sessionId, level: 'error', refused: false, job, message: `${job.destinationFolder} failed: ${job.reason ?? 'no reason given'}` }
}

/**
 * Copies the chosen sessions one after another (VIN-031), one copy at a time: each is planned when
 * its turn comes, a refused or blocked one is reported and skipped, and a pause, a dropped link or a
 * full disk stops the queue so the sessions after it are not started. When the queue ends having
 * copied anything, `onFinished` indexes the copies (VIN-028).
 */
export function makeVesperaCopyQueue(deps: {
  run: (job: TransferJob, options?: RunOptions) => Promise<TransferJob>
  clock: Clock
  onFinished?: (copied: number) => Promise<void> | void
}) {
  type Running = { job: TransferJob; current: string | null; pause: boolean; startedMs: number; startBytes: number }
  type Queue = { waiting: QueueItem[]; total: number; outcomes: QueueOutcome[]; copied: number; busy: boolean; running: Running | null; idle: Promise<void> }
  let queue: Queue | null = null

  const runOne = async (q: Queue, job: TransferJob): Promise<void> => {
    const r: Running = { job, current: null, pause: false, startedMs: deps.clock.now().getTime(), startBytes: job.copiedBytes }
    q.running = r
    let final: TransferJob
    try {
      final = await deps.run(job, {
        onProgress: p => {
          r.job = p.job
          r.current = p.current
        },
        shouldPause: () => r.pause
      })
    } catch (e) {
      final = { ...r.job, state: 'failed', reason: e instanceof Error ? e.message : String(e) }
    }
    q.running = null
    q.outcomes.push(outcomeOf(final))
    if (final.state === 'done') q.copied++
    else q.waiting = []
  }

  const drain = async (q: Queue, first?: TransferJob): Promise<void> => {
    if (first) await runOne(q, first)
    while (q.waiting.length > 0) {
      const item = q.waiting.shift()!
      try {
        const r = await item.plan()
        if (r.status === 'planned' || r.status === 'resume') await runOne(q, r.job)
        else q.outcomes.push({ sessionId: item.sessionId, level: 'warn', refused: r.status === 'refused', job: null, message: r.status === 'refused' ? r.finding.message : r.reason })
      } catch (e) {
        q.outcomes.push({ sessionId: item.sessionId, level: 'error', refused: false, job: null, message: e instanceof Error ? e.message : String(e) })
      }
    }
    try {
      if (q.copied > 0) await deps.onFinished?.(q.copied)
    } catch {
      // Indexing reports its own failures; a copy that is in stays in, and the next can start.
    } finally {
      q.busy = false
    }
  }

  return {
    /** Starts copying `items` in order (after `first`, a job to resume); refused while a copy runs. */
    start(items: QueueItem[], first?: TransferJob): QueueStart {
      if (queue?.busy) return { started: false, reason: 'A copy is already under way; wait for it or pause it.' }
      if (items.length === 0 && !first) return { started: false, reason: 'Choose at least one session to copy.' }
      const q: Queue = { waiting: [...items], total: items.length + (first ? 1 : 0), outcomes: [], copied: 0, busy: true, running: null, idle: Promise.resolve() }
      queue = q
      q.idle = drain(q, first)
      return { started: true }
    },
    /** Pauses the copy under way once the file being copied is in. */
    pause(): boolean {
      if (!queue?.running) return false
      queue.running.pause = true
      return true
    },
    busy: (): boolean => queue?.busy === true,
    /** The queue under way or last run; null before the first. */
    state(): QueueState | null {
      if (!queue) return null
      const r = queue.running
      return {
        busy: queue.busy,
        job: r?.job ?? null,
        current: r?.current ?? null,
        pace: r ? copyPace(r.job.copiedBytes - r.startBytes, r.job.totalBytes - r.startBytes, deps.clock.now().getTime() - r.startedMs) : null,
        position: Math.min(queue.total, queue.outcomes.length + (queue.busy ? 1 : 0)),
        total: queue.total,
        outcomes: queue.outcomes
      }
    },
    /** Settles when the queue under way has ended. */
    idle: (): Promise<void> => queue?.idle ?? Promise.resolve()
  }
}

export type VesperaCopyQueue = ReturnType<typeof makeVesperaCopyQueue>
