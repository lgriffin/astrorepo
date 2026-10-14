import path from 'path'
import { overrideTarget, resolveTarget, type Finding, type IncludedKind, type IngestTarget, type TransferJob } from '@astro/domain'
import type { VesperaScan } from '@astro/application'
import type { VesperaSettings } from '@astro/domain'
import type { IngestJobView, IngestPlanView, IngestScanView, IngestSessionView } from '@shared/types'
import { composeVesperaIngest, type VesperaIngest } from './composition'
import { folderPreview, scanSummary, toIngestJobView, toIngestSessionView } from './adapters/vespera-ingest-presenter'

/**
 * The Vespera ingest in the running app (spec 034): the last scan, the targets named since, and the
 * one transfer that may be running. The scope's address and where copies land come from Settings
 * (spec 033), never from the page.
 */
let ingest: { key: string; parts: VesperaIngest } | null = null
let lastScan: VesperaScan | null = null
const named = new Map<string, { target: IngestTarget; findings: Finding[] }>()
let running: { job: TransferJob; current: string | null; pause: boolean; done: Promise<void> } | null = null

function parts(settings: VesperaSettings): VesperaIngest {
  const key = `${settings.host}:${settings.port}:${settings.landingRoot ?? ''}`
  if (!ingest || ingest.key !== key) ingest = { key, parts: composeVesperaIngest(settings.host, settings.port, settings.landingRoot) }
  return ingest.parts
}

const jobView = (job: TransferJob, current: string | null = null) => toIngestJobView(job, current, (a, b) => path.join(a, b))

async function latestJobs(p: VesperaIngest): Promise<Map<string, TransferJob>> {
  const out = new Map<string, TransferJob>()
  for (const job of await p.store.list()) if (!out.has(job.sessionId)) out.set(job.sessionId, job)
  if (running) out.set(running.job.sessionId, running.job)
  return out
}

function scanned(id: string) {
  const s = lastScan?.sessions.find(x => x.session.id === id)
  if (!s) throw new Error('That session is not in the last scan; scan the scope again.')
  return s
}

const targetOf = (id: string) => named.get(id) ?? { target: resolveTarget([{ source: 'folder', raw: scanned(id).session.rawLabel }]).target, findings: [] }

async function sessionView(p: VesperaIngest, id: string): Promise<IngestSessionView> {
  const jobs = await latestJobs(p)
  const job = jobs.get(id)
  const t = targetOf(id)
  return toIngestSessionView(scanned(id), t.target, t.findings, job ? jobView(job, running?.job.id === job.id ? running.current : null) : null)
}

/** Lists every session on the scope; reads nothing but listings. */
export async function ingestScan(settings: VesperaSettings): Promise<IngestScanView> {
  try {
    const p = parts(settings)
    lastScan = await p.scan()
    for (const id of [...named.keys()]) if (!lastScan.sessions.some(s => s.session.id === id)) named.delete(id)
    const sessions = await Promise.all(lastScan.sessions.map(s => sessionView(p, s.session.id)))
    return { ok: true, address: settings.host, destinationRoot: settings.landingRoot, expertMode: lastScan.expertMode, sessions, summary: scanSummary(sessions) }
  } catch (error) {
    return { ok: false, error: `The scope could not be scanned: ${error instanceof Error ? error.message : String(error)} Is the PC on the Vespera's Wi-Fi?` }
  }
}

/** Reads further clues for a session's target (observation.json, EXIF, FITS), cheapest first. */
export async function ingestIdentify(settings: VesperaSettings, id: string): Promise<IngestSessionView> {
  const p = parts(settings)
  const s = scanned(id)
  named.set(id, await p.identify(s.session, lastScan!.userFolder, { crossCheck: true }))
  return sessionView(p, id)
}

/** The user's own name for a session's target. */
export async function ingestName(settings: VesperaSettings, id: string, name: string): Promise<IngestSessionView> {
  const p = parts(settings)
  const t = targetOf(id)
  const target = overrideTarget(t.target, name)
  if (target) named.set(id, { target, findings: t.findings.filter(f => f.code !== 'TARGET_MISMATCH') })
  return sessionView(p, id)
}

/** The folder a transfer of these kinds would make. */
export function ingestPreview(id: string, include: IncludedKind[]): { folder: string | null } {
  return { folder: folderPreview(scanned(id).session, targetOf(id).target, include) }
}

function start(p: VesperaIngest, job: TransferJob): void {
  const state: { job: TransferJob; current: string | null; pause: boolean; done: Promise<void> } = { job, current: null, pause: false, done: Promise.resolve() }
  running = state
  state.done = p
    .run(job, {
      onProgress: pr => {
        state.job = pr.job
        state.current = pr.current
      },
      shouldPause: () => state.pause
    })
    .then(
      final => {
        state.job = final
      },
      error => {
        state.job = { ...state.job, state: 'failed', reason: error instanceof Error ? error.message : String(error) }
      }
    )
    .finally(() => {
      state.current = null
      if (running === state) running = null
    })
}

/** Plans one press of Transfer and starts the copy; one transfer runs at a time. */
export async function ingestTransfer(settings: VesperaSettings, id: string, include: IncludedKind[], allowDuplicate: boolean): Promise<IngestPlanView> {
  if (running) return { status: 'blocked', reason: 'A transfer is already running; wait for it or pause it.' }
  if (!settings.landingRoot) return { status: 'blocked', reason: 'Choose where copies land in Settings first.' }
  const p = parts(settings)
  const s = scanned(id)
  const t = targetOf(id)
  const r = await p.plan({ session: s.session, userFolder: lastScan!.userFolder, target: t.target, findings: [...s.inventory.findings, ...t.findings], include, destinationRoot: settings.landingRoot, allowDuplicate })
  if (r.status === 'refused') return { status: 'refused', folder: r.folder, message: r.finding.message }
  if (r.status === 'blocked') return r
  start(p, r.job)
  return { status: r.status === 'planned' ? 'started' : 'resumed', job: jobView(r.job) }
}

/** Carries on a paused or failed transfer from the first file not yet copied. */
export async function ingestResume(settings: VesperaSettings, jobId: string): Promise<IngestPlanView> {
  if (running) return { status: 'blocked', reason: 'A transfer is already running; wait for it or pause it.' }
  const p = parts(settings)
  const job = await p.store.get(jobId)
  if (!job) return { status: 'blocked', reason: 'That transfer is not known any more.' }
  start(p, job)
  return { status: 'resumed', job: jobView(job) }
}

/** Pauses the running transfer once the file being copied is in. */
export function ingestPause(): { pausing: boolean } {
  if (!running) return { pausing: false }
  running.pause = true
  return { pausing: true }
}

/** The running transfer, or null. */
export function ingestProgress(): IngestJobView | null {
  return running ? jobView(running.job, running.current) : null
}
