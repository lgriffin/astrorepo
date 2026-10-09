import type { Job, JobCommand, JobSettings, MachineLoad, NewJob } from '@astro/domain'

export type JobPatch = Partial<Pick<Job, 'state' | 'timing' | 'startedAt' | 'finishedAt' | 'exitCode' | 'note' | 'attempts' | 'progress'>>

/** Driven port: the jobs the user queued, and what became of each. */
export interface JobStore {
  add(job: NewJob, queuedAt: Date): Promise<Job>
  get(id: string): Promise<Job | null>
  /** Every job, oldest queued first. */
  list(): Promise<Job[]>
  update(id: string, patch: JobPatch): Promise<Job>
  /** Applies the patch only while the job is still in state `from`, in one step; null when it had moved on. */
  transition(id: string, from: Job['state'], patch: JobPatch): Promise<Job | null>
}

/** Driven port: the run window and idle rules the user set. */
export interface JobSettingsSource {
  read(): Promise<JobSettings>
}

/** Driven port: how busy the PC is right now. */
export interface MachineMonitor {
  sample(): Promise<MachineLoad>
}

export interface RunningProcess {
  /** Settles when the program exits; exitCode is null when it was killed or never started. */
  done: Promise<{ exitCode: number | null; error: string | null }>
  /** Stops the program and every process it started. */
  cancel(): void
}

/**
 * Driven port: runs one program directly (never through a shell) at below-normal priority,
 * streaming its output as it comes.
 */
export interface ProcessRunner {
  /** `stream` says where the text came from when the runner can tell (SyQon writes progress to stderr, its output path to stdout). */
  run(command: JobCommand, onOutput: (text: string, stream?: 'stdout' | 'stderr') => void): RunningProcess
}

/** Driven port: each job's output, kept after it finishes. */
export interface JobLogs {
  append(jobId: string, text: string): void
  /** The end of the log, at most `maxBytes`; empty when there is none. */
  read(jobId: string, maxBytes: number): Promise<string>
}
