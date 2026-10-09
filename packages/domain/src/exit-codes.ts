import type { JobKind } from './jobs'
import type { SolverId } from './sky-geometry'
import type { ToolId } from './tools'

/**
 * One exit-code contract for every tool the job runner starts (specs/023-hub-syqon): a tool's
 * exit code becomes an outcome, a plain message and whether queueing it again could help. Pure.
 */

export type ExitOutcome = 'succeeded' | 'failed' | 'cancelled'

export interface ExitVerdict {
  outcome: ExitOutcome
  /** In the user's words, ending in a full stop; empty for success. */
  message: string
  /** Running it again unchanged could succeed (a crash, a full disk); false when something must change first. */
  retryable: boolean
}

export interface ExitCode {
  outcome: ExitOutcome
  message: string
  retryable: boolean
  /** The tool's documentation does not name this code's meaning; the message is generic until confirmed. */
  assumed?: boolean
}

export interface ExitCodeTable {
  tool: ToolId
  /** The name messages use ("SyQon CLI"); a run may pass the program it started instead. */
  label: string
  codes: Record<number, ExitCode>
}

const generic = (label: string, code: number): ExitCode => ({
  outcome: 'failed',
  message: `${label} stopped with exit code ${code}. Its last lines in the log say why.`,
  retryable: true,
  assumed: true
})

/** syqon.eu/develop, read 9 October 2026: exit codes 0 to 7 and 130. Only 0, 4 and 130 are named there. */
const SYQON: ExitCodeTable = {
  tool: 'syqon',
  label: 'SyQon CLI',
  codes: {
    0: { outcome: 'succeeded', message: '', retryable: false },
    1: generic('SyQon CLI', 1),
    2: generic('SyQon CLI', 2),
    3: generic('SyQon CLI', 3),
    4: {
      outcome: 'failed',
      message: 'Your SyQon account does not include this model. Pick a model Settings, under Tools, lists as available, or check your SyQon plan.',
      retryable: false
    },
    5: generic('SyQon CLI', 5),
    6: generic('SyQon CLI', 6),
    7: generic('SyQon CLI', 7),
    130: { outcome: 'cancelled', message: 'SyQon CLI was cancelled before it finished.', retryable: true }
  }
}

/** Siril and Siril_Scripts end 0 on success and non-zero on any failure; the log says which. */
const SIRIL: ExitCodeTable = { tool: 'siril', label: 'Siril', codes: { 0: { outcome: 'succeeded', message: '', retryable: false } } }
const SIRIL_SCRIPTS: ExitCodeTable = { tool: 'siril-scripts', label: 'Siril_Scripts', codes: { 0: { outcome: 'succeeded', message: '', retryable: false } } }
/** The RC Astro CLI documents no codes beyond 0, so every other is generic (an assumption to confirm). */
const RC_ASTRO: ExitCodeTable = { tool: 'rc-astro', label: 'RC Astro CLI', codes: { 0: { outcome: 'succeeded', message: '', retryable: false } } }

/** ASTAP's command line documents these codes for when it leaves no result file (specs/024-sky-geometry). */
const ASTAP: ExitCodeTable = {
  tool: 'astap',
  label: 'ASTAP',
  codes: {
    0: { outcome: 'succeeded', message: '', retryable: false },
    1: { outcome: 'failed', message: 'ASTAP found no solution.', retryable: false },
    2: { outcome: 'failed', message: 'ASTAP found too few stars to solve it.', retryable: false },
    16: { outcome: 'failed', message: 'ASTAP could not read the image.', retryable: true },
    32: { outcome: 'failed', message: 'ASTAP found no star database. Install one beside ASTAP and solve again.', retryable: false },
    33: { outcome: 'failed', message: 'ASTAP could not read its star database.', retryable: false }
  }
}

/** Every tool the job runner starts, directly or (RC Astro) through Siril_Scripts. */
export const EXIT_CODES: Readonly<Record<'siril' | 'siril-scripts' | 'rc-astro' | 'syqon' | 'astap', ExitCodeTable>> = {
  siril: SIRIL,
  'siril-scripts': SIRIL_SCRIPTS,
  'rc-astro': RC_ASTRO,
  syqon: SYQON,
  astap: ASTAP
}

export type RunTool = keyof typeof EXIT_CODES

/** The tool a job's program is, for reading its exit code; a plate solve reads its solver's (ASTAP unless Siril is named). */
export function runToolOf(kind: JobKind, solver?: SolverId): RunTool {
  switch (kind) {
    case 'stack':
      return 'siril'
    case 'post-process':
      return 'siril-scripts'
    case 'syqon':
      return 'syqon'
    case 'solve':
      return solver === 'siril' ? 'siril' : 'astap'
  }
}

export interface ExitContext {
  /** The user (or a quit) stopped it. */
  cancelled: boolean
  /** The program as the message should name it ("siril-cli"); the table's label when not given. */
  program?: string
}

/**
 * What a tool's exit code means. A run the user cancelled is cancelled whatever its code; a run
 * with no code (killed, or never started) failed; a code the table does not list failed with a
 * generic message naming it.
 */
export function interpretExit(tool: RunTool, exitCode: number | null, context: ExitContext): ExitVerdict {
  const table = EXIT_CODES[tool]
  const name = context.program ?? table.label
  if (context.cancelled) return { outcome: 'cancelled', message: 'Cancelled while it ran.', retryable: true }
  if (exitCode === null) return { outcome: 'failed', message: `${name} stopped before it finished, with no exit code.`, retryable: true }
  const known = table.codes[exitCode]
  if (known && !known.assumed) return { outcome: known.outcome, message: known.message, retryable: known.retryable }
  if (exitCode === 0) return { outcome: 'succeeded', message: '', retryable: false }
  if (known) return { outcome: known.outcome, message: known.message.replace(table.label, name), retryable: known.retryable }
  return { outcome: 'failed', message: `${name} exited with code ${exitCode}.`, retryable: true }
}
