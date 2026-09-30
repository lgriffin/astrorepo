import type { JobLogs, JobPatch, JobSettingsSource, JobStore, MachineMonitor, ProcessRunner, RunningProcess } from '@astro/application'
import { DEFAULT_JOB_SETTINGS, type Job, type JobCommand, type JobSettings, type MachineLoad, type NewJob } from '@astro/domain'

export class InMemoryJobStore implements JobStore {
  private readonly jobs = new Map<string, Job>()
  private next = 1

  async add(job: NewJob, queuedAt: Date): Promise<Job> {
    const full: Job = { ...job, id: `job-${this.next++}`, state: 'queued', queuedAt, startedAt: null, finishedAt: null, exitCode: null, note: null, attempts: 0 }
    this.jobs.set(full.id, full)
    return { ...full }
  }

  async get(id: string): Promise<Job | null> {
    const job = this.jobs.get(id)
    return job ? { ...job } : null
  }

  async list(): Promise<Job[]> {
    return [...this.jobs.values()].sort((a, b) => a.queuedAt.getTime() - b.queuedAt.getTime()).map(j => ({ ...j }))
  }

  async update(id: string, patch: JobPatch): Promise<Job> {
    const job = this.jobs.get(id)
    if (!job) throw new Error(`No job ${id}`)
    const updated = { ...job, ...patch }
    this.jobs.set(id, updated)
    return { ...updated }
  }
}

export class FixedJobSettings implements JobSettingsSource {
  constructor(public settings: JobSettings = DEFAULT_JOB_SETTINGS) {}
  async read(): Promise<JobSettings> {
    return this.settings
  }
}

export class FakeMachine implements MachineMonitor {
  constructor(public load: MachineLoad = { userIdleSeconds: 3600, cpuPercent: 5 }) {}
  async sample(): Promise<MachineLoad> {
    return this.load
  }
}

/** A run the test finishes by hand. */
export interface FakeRun {
  command: JobCommand
  output: (text: string) => void
  exit: (exitCode: number | null, error?: string | null) => void
  cancelled: boolean
}

/** Runs nothing: each started program waits until the test calls `exit` on its run. */
export class FakeProcessRunner implements ProcessRunner {
  readonly runs: FakeRun[] = []

  run(command: JobCommand, onOutput: (text: string) => void): RunningProcess {
    let settle: (r: { exitCode: number | null; error: string | null }) => void = () => {}
    const done = new Promise<{ exitCode: number | null; error: string | null }>(resolve => (settle = resolve))
    const run: FakeRun = { command, output: onOutput, exit: (exitCode, error = null) => settle({ exitCode, error }), cancelled: false }
    this.runs.push(run)
    return {
      done,
      cancel: () => {
        run.cancelled = true
        run.exit(null)
      }
    }
  }

  get last(): FakeRun | undefined {
    return this.runs[this.runs.length - 1]
  }
}

export class InMemoryJobLogs implements JobLogs {
  readonly text = new Map<string, string>()
  append(jobId: string, text: string): void {
    this.text.set(jobId, (this.text.get(jobId) ?? '') + text)
  }
  async read(jobId: string, maxBytes: number): Promise<string> {
    return (this.text.get(jobId) ?? '').slice(-maxBytes)
  }
}
