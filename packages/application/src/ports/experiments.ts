import type { ExperimentInput, OutputFile, ToolId, VariantLetter, VariantParameters } from '@astro/domain'

/** How a variant was run: what the job ran and the tools' versions when it was queued (PE-002). */
export interface VariantRun {
  jobId: string
  /** The TARGET this attempt was given and the folder it writes to: a retry gets a folder of its own (PE-003). */
  outputLabel: string
  outputDir: string
  program: string
  args: string[]
  cwd: string
  tools: { id: ToolId; version: string | null }[]
  queuedAt: Date
}

export interface VariantRecord {
  id: string
  letter: VariantLetter
  parameters: VariantParameters
  /** The TARGET Siril_Scripts is given, which names the variant's own output folder. */
  outputLabel: string
  outputDir: string
  /** The latest run; null until it is queued. */
  run: VariantRun | null
  /** The files a successful run left, recorded once; null until then. */
  outputs: OutputFile[] | null
  outputsRecordedAt: Date | null
}

/** A processing experiment as kept (specs/040-experiment-lab). The input and the variants' settings never change once made (PE-001). */
export interface ExperimentRecord {
  id: string
  targetId: string
  /** The experiment's number on its target, 1 for the first, used in its output folders. */
  number: number
  name: string
  objective: string
  input: ExperimentInput
  variants: VariantRecord[]
  preferredVariantId: string | null
  createdAt: Date
}

export interface NewExperiment {
  targetId: string
  number: number
  name: string
  objective: string
  input: ExperimentInput
  variants: Omit<VariantRecord, 'id' | 'run' | 'outputs' | 'outputsRecordedAt'>[]
  createdAt: Date
}

/**
 * Driven port: experiments and their variants. The input and settings are written once; only a
 * variant's run, its recorded outputs and the preferred variant change afterwards. Adapters:
 * SQLite (desktop), in-memory (testkit).
 */
export interface ExperimentStore {
  /** A target's experiments, newest first. */
  list(targetId: string): Promise<ExperimentRecord[]>
  get(id: string): Promise<ExperimentRecord | null>
  create(experiment: NewExperiment): Promise<ExperimentRecord>
  recordRun(variantId: string, run: VariantRun): Promise<void>
  /** Keeps what a successful run left; a later call for the same variant is ignored, so the first record stands. */
  recordOutputs(variantId: string, outputs: OutputFile[], at: Date): Promise<void>
  /** Marks one variant preferred, or none with null; the others are kept as they are. */
  prefer(experimentId: string, variantId: string | null): Promise<void>
}

/** A file in a variant's output folder, before it is hashed. */
export interface FolderFile {
  path: string
  name: string
  sizeBytes: number
}

/** Driven port: what is in a folder, read only. */
export interface OutputFolder {
  /** The files directly in the folder, by name; null when the folder is not there. */
  list(dir: string): Promise<FolderFile[] | null>
  /** The file's size and modified time now; null when it is gone. */
  stat(path: string): Promise<{ sizeBytes: number; modifiedAt: Date } | null>
}
