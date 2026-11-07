/** Vespera ingest (spec 034). */

// ── Vespera ingest (spec 034) ──────────────────────────────────────────

export type IngestKindView = 'fits' | 'tiff' | 'jpeg' | 'json'

export interface IngestFindingView {
  level: 'info' | 'warn' | 'error'
  code: string
  message: string
}

/** One session on the scope, as the review table shows it. */
export interface IngestSessionView {
  id: string
  kind: string
  /** "15 Jun 2024, 21:00", or null when the folder has no date. */
  when: string | null
  date: string | null
  label: string | null
  target: { name: string; confidence: string; review: boolean; evidence: string[] }
  counts: { fits: number; tiff: number; jpeg: number; json: number; other: number }
  runs: { folder: string; fits: number; tiff: number; jpeg: number; json: number; other: number }[]
  size: string
  /** The bytes a transfer copies, of the kinds chosen in Settings. */
  transferBytes: number
  transferSize: string
  worst: 'info' | 'warn' | 'error' | null
  findings: IngestFindingView[]
  /** Transfer is on: no error finding and a named target. */
  transferable: boolean
  /** Only observations are offered for transfer by default; the rest are shown folded. */
  deepSky: boolean
  /** The latest transfer of this session, when there is one. */
  job: IngestJobView | null
}

export type IngestScanView =
  | { ok: true; address: string; destinationRoot: string | null; freeBytes: number | null; expertMode: boolean; sessions: IngestSessionView[]; summary: string }
  | { ok: false; error: string }

export interface IngestJobView {
  id: string
  sessionId: string
  folder: string
  state: 'planned' | 'running' | 'paused' | 'verifying' | 'done' | 'failed'
  /** "12 of 400 files, 50.4 MB of 1.7 GB". */
  headline: string
  fraction: number
  current: string | null
  reason: string | null
  findings: IngestFindingView[]
  manifestPath: string | null
}

export type IngestPlanView = { status: 'started' } | { status: 'blocked'; reason: string }

/** What became of one session of a copy. `refused`: its folder name is taken by another session. */
export interface IngestOutcomeView {
  sessionId: string
  level: 'info' | 'warn' | 'error'
  refused: boolean
  message: string
}

/** The copy under way or last run: one session after another. */
export interface IngestProgressView {
  running: boolean
  /** "Copying session 2 of 3: M31_2026-10-14_FIT=400_TIF=1". */
  headline: string
  /** "12 of 400 files, 50.4 MB of 1.7 GB, 3.1 MB/s, about 9 min left". */
  detail: string | null
  fraction: number
  current: string | null
  outcomes: IngestOutcomeView[]
  /** How indexing the copies is going, once the queue ends. */
  indexing: string | null
}
