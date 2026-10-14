import {
  canTransfer,
  destinationFolderName,
  inventorySession,
  MANIFEST_FILE,
  planCounts,
  planTransfer,
  type Finding,
  type IncludedKind,
  type IngestTarget,
  type TransferJob,
  type VesperaSession
} from '@astro/domain'
import type { ScannedSession } from '@astro/application'
import type { IngestFindingView, IngestJobView, IngestSessionView } from '@shared/types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "15 Jun 2024, 21:00" from a scope-local YYYY-MM-DDTHH:MM:SS. */
export function sessionWhen(startedAt: string | null): string | null {
  const m = startedAt ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(startedAt) : null
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}, ${m[4]}:${m[5]}` : null
}

export function bytesText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(1)} ${units[i]}`
}

const findingView = (f: Finding): IngestFindingView => ({ level: f.level, code: f.code, message: f.message })

/** Errors first, then warnings, then notes, keeping their order within a level. */
export function orderedFindings(findings: Finding[]): IngestFindingView[] {
  const rank = { error: 0, warn: 1, info: 2 }
  return findings.map((f, i) => ({ f, i })).sort((a, b) => rank[a.f.level] - rank[b.f.level] || a.i - b.i).map(({ f }) => findingView(f))
}

export function toIngestJobView(job: TransferJob, current: string | null = null, join: (a: string, b: string) => string = (a, b) => `${a}/${b}`): IngestJobView {
  const files = job.items.length
  const done = job.committed.length
  const headline =
    job.state === 'done'
      ? `Copied ${files} ${files === 1 ? 'file' : 'files'} (${bytesText(job.totalBytes)}) to ${job.destinationFolder}`
      : `${done} of ${files} files, ${bytesText(job.copiedBytes)} of ${bytesText(job.totalBytes)}`
  return {
    id: job.id,
    sessionId: job.sessionId,
    folder: job.destinationFolder,
    state: job.state,
    headline,
    fraction: job.totalBytes > 0 ? Math.min(1, job.copiedBytes / job.totalBytes) : job.state === 'done' ? 1 : 0,
    current,
    reason: job.reason,
    findings: orderedFindings(job.findings),
    manifestPath: job.state === 'done' ? join(job.id, MANIFEST_FILE) : null
  }
}

/** The folder a transfer of these kinds would make, shown read-only as the user chooses. */
export function folderPreview(session: VesperaSession, target: Pick<IngestTarget, 'name'>, include: IncludedKind[]): string | null {
  if (!session.startedAt || include.length === 0) return null
  return destinationFolderName({ target, date: session.startedAt.slice(0, 10), counts: planCounts(planTransfer(session, include), include) })
}

/** A scanned session as the review table shows it, with what is known of its target and its latest transfer. */
export function toIngestSessionView(scanned: ScannedSession, target: IngestTarget, extra: Finding[], job: IngestJobView | null): IngestSessionView {
  const { session } = scanned
  const inventory = scanned.inventory ?? inventorySession(session)
  const findings = [...inventory.findings, ...extra]
  const worst = findings.some(f => f.level === 'error') ? 'error' : findings.some(f => f.level === 'warn') ? 'warn' : findings.length > 0 ? 'info' : null
  return {
    id: session.id,
    kind: session.kind,
    when: sessionWhen(session.startedAt),
    date: session.startedAt?.slice(0, 10) ?? null,
    label: session.rawLabel,
    target: { name: target.name, confidence: target.confidence, review: target.review, evidence: target.evidence },
    counts: inventory.totals,
    runs: Object.entries(inventory.perRun).map(([folder, c]) => ({ folder, ...c })),
    size: bytesText(inventory.bytes),
    worst,
    findings: orderedFindings(findings),
    transferable: canTransfer(findings, target),
    deepSky: session.kind === 'observation',
    job
  }
}

/** "17 sessions on the scope, 12 observations; 3 already in the repository." */
export function scanSummary(sessions: IngestSessionView[]): string {
  const observations = sessions.filter(s => s.deepSky).length
  const copied = sessions.filter(s => s.job?.state === 'done').length
  const base = `${sessions.length} ${sessions.length === 1 ? 'session' : 'sessions'} on the scope, ${observations} ${observations === 1 ? 'observation' : 'observations'}`
  return copied > 0 ? `${base}; ${copied} already in the repository.` : `${base}.`
}
