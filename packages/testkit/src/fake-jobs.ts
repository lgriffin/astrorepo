import type { JobLogs, JobPatch, JobSettingsSource, JobStore, MachineMonitor, ProcessRunner, RunArea, RunningProcess } from '@astro/application'
import { DEFAULT_JOB_SETTINGS, FAILED_FOLDER, MANIFEST_SUFFIX, STEP_FOLDER, type Job, type JobCommand, type JobSettings, type MachineLoad, type NewJob, type StackManifest } from '@astro/domain'

export class InMemoryJobStore implements JobStore {
  private readonly jobs = new Map<string, Job>()
  private next = 1

  async add(job: NewJob, queuedAt: Date): Promise<Job> {
    const full: Job = { solve: null, ...job, id: `job-${this.next++}`, state: 'queued', queuedAt, startedAt: null, finishedAt: null, exitCode: null, note: null, attempts: 0, progress: null }
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

  async transition(id: string, from: Job['state'], patch: JobPatch): Promise<Job | null> {
    const job = this.jobs.get(id)
    return job && job.state === from ? this.update(id, patch) : null
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
  /** Output from the program; ignored once it has ended, as a real program writes nothing after it exits. */
  output: (text: string, stream?: 'stdout' | 'stderr') => void
  /** Ends the program; only the first call counts. */
  exit: (exitCode: number | null, error?: string | null) => void
  cancelled: boolean
  ended: boolean
}

/**
 * Runs nothing: each started program waits until the test calls `exit` on its run, or until the
 * `onStart` script given to the constructor ends it. Cancel stops a program that is still running
 * as the real runner does: no exit code and the reason it stopped; once it has ended it does nothing.
 */
export class FakeProcessRunner implements ProcessRunner {
  readonly runs: FakeRun[] = []

  constructor(private readonly onStart: (run: FakeRun) => void = () => {}) {}

  run(command: JobCommand, onOutput: (text: string, stream?: 'stdout' | 'stderr') => void): RunningProcess {
    let settle: (r: { exitCode: number | null; error: string | null }) => void = () => {}
    const done = new Promise<{ exitCode: number | null; error: string | null }>(resolve => (settle = resolve))
    const run: FakeRun = {
      command,
      output: (text, stream) => {
        if (!run.ended) onOutput(text, stream)
      },
      exit: (exitCode, error = null) => {
        if (run.ended) return
        run.ended = true
        settle({ exitCode, error })
      },
      cancelled: false,
      ended: false
    }
    this.runs.push(run)
    this.onStart(run)
    return {
      done,
      cancel: () => {
        if (run.ended) return
        run.cancelled = true
        run.exit(null, `${command.program} was stopped (cancelled).`)
      }
    }
  }

  get last(): FakeRun | undefined {
    return this.runs[this.runs.length - 1]
  }
}

/** The end of a text, at most `maxBytes` of UTF-8, starting on a whole character. */
function utf8Tail(text: string, maxBytes: number): string {
  const bytes = new TextEncoder().encode(text)
  let start = Math.max(0, bytes.length - Math.max(0, maxBytes))
  // A UTF-8 continuation byte is the middle of a character cut in two: start after it.
  while (start < bytes.length && (bytes[start] & 0xc0) === 0x80) start++
  return new TextDecoder().decode(bytes.subarray(start))
}

/** Job logs in a map, refusing what is not a job id as the file logs do. */
export class InMemoryJobLogs implements JobLogs {
  readonly text = new Map<string, string>()

  private check(jobId: string): string {
    if (!/^[A-Za-z0-9_-]+$/.test(jobId)) throw new Error(`Not a job id: ${jobId}`)
    return jobId
  }

  append(jobId: string, text: string): void {
    this.text.set(this.check(jobId), (this.text.get(jobId) ?? '') + text)
  }

  async read(jobId: string, maxBytes: number): Promise<string> {
    return utf8Tail(this.text.get(this.check(jobId)) ?? '', maxBytes)
  }
}

const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p

/**
 * A run area over maps, with '/' paths: the files it can read (scripts, steps, manifests and
 * anything a test puts there), steps written, results set aside and manifests written.
 */
export class InMemoryRunArea implements RunArea {
  /** Every file the area can read, by path. */
  readonly texts = new Map<string, string>()
  readonly steps: { path: string; text: string }[] = []
  readonly setAsideFiles: string[] = []
  /** Every manifest written, by its result. */
  readonly manifests = new Map<string, StackManifest>()
  /** Called with each set-aside path, so a fake work area can drop it. */
  onSetAside: (path: string) => void = () => {}

  async readText(path: string): Promise<string> {
    const text = this.texts.get(path)
    if (text === undefined) throw new Error(`ENOENT: ${path}`)
    return text
  }

  async writeStep(workDir: string, name: string, text: string): Promise<string> {
    if (name !== baseName(name) || name === '..' || name === '.') throw new Error(`${name} is not a plain file name.`)
    const path = `${workDir}/${STEP_FOLDER}/${name}`
    this.texts.set(path, text)
    this.steps.push({ path, text })
    return path
  }

  async setAside(workDir: string, run: string, paths: string[]): Promise<string[]> {
    // Only files of the work folder move; anything else is left where it is.
    const mine = paths.filter(p => p.startsWith(`${workDir}/`) && !p.slice(workDir.length + 1).split('/').includes('..'))
    const dir = `${workDir}/${FAILED_FOLDER}/${baseName(run)}`
    return mine.map(p => {
      this.setAsideFiles.push(p)
      this.onSetAside(p)
      // The result and any manifest beside it, finished or half-written, move together (as NodeRunArea does).
      for (const side of ['', MANIFEST_SUFFIX, `${MANIFEST_SUFFIX}.tmp`]) {
        const text = this.texts.get(`${p}${side}`)
        if (text === undefined) continue
        this.texts.delete(`${p}${side}`)
        this.texts.set(`${dir}/${baseName(p)}${side}`, text)
      }
      const manifest = this.manifests.get(p)
      if (manifest) {
        this.manifests.delete(p)
        this.manifests.set(`${dir}/${baseName(p)}`, manifest)
      }
      return `${dir}/${baseName(p)}`
    })
  }

  async writeManifest(resultPath: string, manifest: StackManifest): Promise<string> {
    const path = `${resultPath}${MANIFEST_SUFFIX}`
    this.manifests.set(resultPath, structuredClone(manifest))
    this.texts.set(path, `${JSON.stringify(manifest, null, 2)}\n`)
    return path
  }
}
