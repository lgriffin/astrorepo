import path from 'path'
import { folderTarget, overrideTarget, resolveTarget, type Finding, type IncludedKind, type IngestTarget, type TransferJob, type VesperaSettings } from '@astro/domain'
import type { VesperaScan } from '@astro/application'
import type { IngestPlanView, IngestProgressView, IngestScanView, IngestSessionView } from '@shared/types'
import { composeVesperaCopyQueue, composeVesperaIngest, type VesperaIngest } from './composition'
import { folderPreview, scanSummary, toIngestJobView, toIngestProgressView, toIngestSessionView } from './adapters/vespera-ingest-presenter'
import { indexingText } from './adapters/vespera-presenter'
import { indexCopies, resetIndexing, vesperaIndexing } from './vespera-host'

/**
 * The Vespera page's one copy flow (spec 034, on spec 033's connection): the last scan, the targets
 * named since, and the queue of sessions being copied one after another. The scope's address, where
 * copies land and the kinds of file to copy come from Settings, never from the page.
 */
let ingest: { key: string; parts: VesperaIngest } | null = null
let lastScan: VesperaScan | null = null
const named = new Map<string, { target: IngestTarget; findings: Finding[] }>()

/** The one copy queue: it outlives a change of settings, since it holds the copy under way. */
let indexFor: { landingRoot: string; homeFolder: string | null } | null = null
let runner: VesperaIngest['run'] = async job => job
const copies = composeVesperaCopyQueue(
  () => runner,
  () => (indexFor ? indexCopies(indexFor.landingRoot, indexFor.homeFolder) : undefined)
)

function parts(settings: VesperaSettings): VesperaIngest {
  const key = `${settings.host}:${settings.port}:${settings.landingRoot ?? ''}`
  if (!ingest || ingest.key !== key) ingest = { key, parts: composeVesperaIngest(settings.host, settings.port, settings.landingRoot) }
  return ingest.parts
}

const join = (a: string, b: string) => path.join(a, b)
const jobView = (job: TransferJob, current: string | null = null) => toIngestJobView(job, current, join)

async function latestJobs(p: VesperaIngest): Promise<Map<string, TransferJob>> {
  const out = new Map<string, TransferJob>()
  for (const job of await p.store.list()) if (!out.has(job.sessionId)) out.set(job.sessionId, job)
  const running = copies.state()?.job
  if (running) out.set(running.sessionId, running)
  return out
}

function scanned(id: string) {
  const s = lastScan?.sessions.find(x => x.session.id === id)
  if (!s) throw new Error('That session is not in the last scan; scan the scope again.')
  return s
}

const targetOf = (id: string) => named.get(id) ?? { target: resolveTarget([{ source: 'folder', raw: scanned(id).session.rawLabel }]).target, findings: [] }

async function sessionView(p: VesperaIngest, id: string, include: IncludedKind[]): Promise<IngestSessionView> {
  const job = (await latestJobs(p)).get(id)
  const t = targetOf(id)
  const state = copies.state()
  const current = state?.job && state.job.id === job?.id ? state.current : null
  return toIngestSessionView(scanned(id), t.target, t.findings, job ? jobView(job, current) : null, include)
}

/** Lists every session on the scope; reads nothing but listings. */
export async function ingestScan(settings: VesperaSettings): Promise<IngestScanView> {
  if (copies.busy()) return { ok: false, error: 'A copy is under way; pause it or let it finish before scanning again.' }
  try {
    const p = parts(settings)
    lastScan = await p.scan()
    for (const id of [...named.keys()]) if (!lastScan.sessions.some(s => s.session.id === id)) named.delete(id)
    const sessions = await Promise.all(lastScan.sessions.map(s => sessionView(p, s.session.id, settings.formats)))
    const freeBytes = settings.landingRoot ? await p.disk.freeBytes(settings.landingRoot) : null
    return { ok: true, address: settings.host, destinationRoot: settings.landingRoot, freeBytes, expertMode: lastScan.expertMode, sessions, summary: scanSummary(sessions) }
  } catch (error) {
    return { ok: false, error: `The scope could not be scanned at ${settings.host}: ${error instanceof Error ? error.message : String(error)} Is the PC on the Vespera's Wi-Fi?` }
  }
}

/** Reads further clues for a session's target (observation.json, EXIF, FITS), cheapest first. */
export async function ingestIdentify(settings: VesperaSettings, id: string): Promise<IngestSessionView> {
  const p = parts(settings)
  const s = scanned(id)
  named.set(id, await p.identify(s.session, lastScan!.userFolder, { crossCheck: true }))
  return sessionView(p, id, settings.formats)
}

/** The user's own name for a session's target. */
export async function ingestName(settings: VesperaSettings, id: string, name: string): Promise<IngestSessionView> {
  const p = parts(settings)
  const t = targetOf(id)
  const target = overrideTarget(t.target, name)
  if (target) named.set(id, { target, findings: t.findings.filter(f => f.code !== 'TARGET_MISMATCH') })
  return sessionView(p, id, settings.formats)
}

/** The target folder and session folder a transfer of the kinds in Settings would make. */
export function ingestPreview(settings: VesperaSettings, id: string): { targetFolder: string; folder: string | null } {
  const target = targetOf(id).target
  return { targetFolder: folderTarget(target), folder: folderPreview(scanned(id).session, target, settings.formats) }
}

function startQueue(settings: VesperaSettings, homeFolder: string | null, ids: string[], allowDuplicate: boolean, first?: TransferJob): IngestPlanView {
  if (copies.busy()) return { status: 'blocked', reason: 'A copy is already under way; wait for it or pause it.' }
  const landingRoot = first?.destinationRoot ?? settings.landingRoot
  if (!landingRoot) return { status: 'blocked', reason: 'Choose where copies land first.' }
  const p = parts({ ...settings, landingRoot })
  const userFolder = lastScan?.userFolder ?? 'user'
  const items = ids.map(id => ({
    sessionId: id,
    plan: () => {
      const s = scanned(id)
      const t = targetOf(id)
      return p.plan({ session: s.session, userFolder, target: t.target, findings: [...s.inventory.findings, ...t.findings], include: settings.formats, destinationRoot: landingRoot, allowDuplicate })
    }
  }))
  runner = p.run
  indexFor = { landingRoot, homeFolder }
  resetIndexing()
  const r = copies.start(items, first)
  return r.started ? { status: 'started' } : { status: 'blocked', reason: r.reason }
}

/** Copies the chosen sessions one after another, each into its own folder. */
export function ingestTransfer(settings: VesperaSettings, homeFolder: string | null, ids: string[], allowDuplicate: boolean): IngestPlanView {
  for (const id of ids) scanned(id)
  return startQueue(settings, homeFolder, ids, allowDuplicate)
}

/** Carries on a paused or failed copy from the first file not yet copied. */
export async function ingestResume(settings: VesperaSettings, homeFolder: string | null, jobId: string): Promise<IngestPlanView> {
  if (copies.busy()) return { status: 'blocked', reason: 'A copy is already under way; wait for it or pause it.' }
  const job = await parts(settings).store.get(jobId)
  if (!job) return { status: 'blocked', reason: 'That copy is not known any more.' }
  return startQueue(settings, homeFolder, [], false, job)
}

/** Pauses the copy under way once the file being copied is in; the rest of the queue is not started. */
export function ingestPause(): { pausing: boolean } {
  return { pausing: copies.pause() }
}

/** The queue under way or last run, or null when nothing has been copied since the app started. */
export function ingestProgress(): IngestProgressView | null {
  const q = copies.state()
  if (!q) return null
  return toIngestProgressView({
    running: q.busy,
    job: q.job ? jobView(q.job, q.current) : null,
    pace: q.pace,
    position: q.position,
    total: q.total,
    outcomes: q.outcomes.map(o => ({ sessionId: o.sessionId, level: o.level, refused: o.refused, message: o.message })),
    indexing: indexingText(vesperaIndexing())
  })
}
