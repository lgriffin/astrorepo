/** The experiment lab (spec 040). */
import type { PreviewView } from './gallery-inspector'

// ── Experiment lab (specs/040-experiment-lab) ─────────────────────────────

export interface ExperimentVariantView {
  id: string
  letter: string
  profile: string
  quality: string
  /** "Galaxy profile, normal quality" */
  settings: string
  state: 'not run' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'job missing'
  /** "Finished", "Failed (exit code 1)" … */
  stateText: string
  outputDir: string
  /** "3 files, 1.2 GB"; null until a successful run's files are recorded. */
  outputs: string | null
  outputsMissing: boolean
  /** Finished after the stack changed, so its files are not taken as this experiment's. */
  inputChanged: boolean
  preferred: boolean
  canPrefer: boolean
}

export interface ExperimentView {
  id: string
  name: string
  objective: string
  /** "Experiment 2 on result.fit (1.2 GB), made 26 Oct 2026" */
  summary: string
  inputPath: string
  /** The first 12 hex characters of the input's SHA-256. */
  inputHash: string
  variants: ExperimentVariantView[]
  /** Some variant has not run, or its run failed or was cancelled. */
  canRun: boolean
  /** At least two variants succeeded, so there is something to compare. */
  canCompare: boolean
}

export interface ComparedVariantView {
  letter: string
  settings: string
  preferred: boolean
  /** The final image's name, when there is one. */
  file: string | null
  preview: PreviewView | null
  error: string | null
  figures: { label: string; value: string }[] | null
}

export interface ExperimentComparisonView {
  variants: ComparedVariantView[]
  notes: string[]
}

export type ExperimentChangeView = { ok: true; id: string } | { ok: false; problems: string[] }
export type ExperimentRunView = { ok: true; queued: string } | { ok: false; problems: string[] }

/** One source of a fact (specs/042-learning). */
export interface LearningSourceView {
  id: string
  title: string
  publisher: string
}
