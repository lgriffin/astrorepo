import { afterInterruption, jobHistory, scheduleJobs, type Job, type JobSettings, type MachineLoad, type Schedule } from '@astro/domain'
import type { Clock } from '../ports/clock'
import type { JobLogs, JobSettingsSource, JobStore, MachineMonitor, ProcessRunner, RunningProcess } from '../ports/jobs'
import type { SirilWorkspace } from '../ports/siril-workspace'
import type { PrepareSirilWorkspace } from './prepare-siril-workspace'

export interface JobSchedulerDeps {
  store: JobStore
  settings: JobSettingsSource
  machine: MachineMonitor
  runner: ProcessRunner
  logs: JobLogs
  /** Free space where a job writes. */
  workspace: Pick<SirilWorkspace, 'workAreaSpace'>
  /** Lays a stack job's frames out before Siril runs. */
  prepare: PrepareSirilWorkspace
  /** Folders the app only reads, which a work area must not overlap. */
  readOnlyDirs: () => string[] | Promise<string[]>
  clock: Clock
  /** Called whenever a job starts or finishes, so the host can check the queue again. */
  onChange?: () => void
}

export interface JobsSnapshot {
  jobs: Job[]
  schedule: Schedule
  settings: JobSettings
  load: MachineLoad
}

export interface JobScheduler {
  /** Starts the next job if the rules allow, and says why the others wait. */
  tick(): Promise<JobsSnapshot>
  /** The queue as it stands, without starting anything. */
  snapshot(): Promise<JobsSnapshot>
  /** The jobs alone, without sampling the machine or checking disk space (for pages that only show them). */
  list(): Promise<Job[]>
  /** Stops a job, or takes it off the queue before it starts. */
  cancel(jobId: string): Promise<Job>
  /** Moves a queued job ahead of the window and idle rules. */
  runNow(jobId: string): Promise<Job>
  /** At startup: a job left running when the app last closed is queued again, or failed after too many tries. */
  recover(): Promise<void>
  /** At quit: stops what runs, leaving it to be recovered at the next start. */
  shutdown(): void
  /** Before the job table is cleared: cancels what runs and waits for it to stop. */
  clear(): Promise<void>
  log(jobId: string, maxBytes?: number): Promise<string>
  /** Settles when no job is running (for tests and quitting). */
  idle(): Promise<void>
  /** A job this process started is still running. */
  busy(): boolean
}

export class JobStateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JobStateError'
  }
}

/**
 * The job runner: one job at a time, started by `tick` when scheduleJobs allows. A stack job lays
 * its frames out first; each job's output goes to its log; the exit code decides success.
 */
export function makeJobScheduler(deps: JobSchedulerDeps): JobScheduler {
  /** Jobs this process started and has not yet seen finish. */
  const active = new Map<string, { process: RunningProcess | null; cancelled: boolean; finished: Promise<void> }>()
  let stopping = false

  const snapshot = async (): Promise<JobsSnapshot> => {
    const [jobs, settings, load] = await Promise.all([deps.store.list(), deps.settings.read(), deps.machine.sample()])
    const queued = jobs.filter(j => j.state === 'queued')
    const free = await Promise.all(queued.map(async j => [j.id, (await deps.workspace.workAreaSpace(j.spaceDir)).freeBytes] as const))
    const schedule = scheduleJobs({ now: deps.clock.now(), settings, jobs, history: jobHistory(jobs), load, freeBytes: Object.fromEntries(free) })
    return { jobs, schedule, settings, load }
  }

  const finish = async (id: string, state: Job['state'], exitCode: number | null, note: string | null) => {
    const job = await deps.store.update(id, { state, exitCode, note, finishedAt: deps.clock.now() })
    deps.logs.append(id, `\n${job.finishedAt?.toISOString()} ${state}${exitCode === null ? '' : ` (exit code ${exitCode})`}${note ? `: ${note}` : ''}\n`)
  }

  type Entry = { process: RunningProcess | null; cancelled: boolean; finished: Promise<void> }

  const run = async (job: Job, entry: Entry) => {
    const { command } = job
    deps.logs.append(job.id, `${deps.clock.now().toISOString()} started ${job.title}\n> ${[command.program, ...command.args].join(' ')}\n\n`)
    if (job.prepare) {
      try {
        const prep = await deps.prepare(job.prepare.sourceDir, job.prepare.workDir, await deps.readOnlyDirs())
        deps.logs.append(job.id, `Prep for Siril: ${prep.linked} linked, ${prep.copied} copied, ${prep.existing} already in place.\n\n`)
      } catch (error) {
        if (!stopping) await finish(job.id, entry.cancelled ? 'cancelled' : 'failed', null, error instanceof Error ? error.message : String(error))
        return
      }
    }
    // Checked again right before the program starts: a cancel or quit may have come in meanwhile.
    if (stopping) return
    if (entry.cancelled) {
      await finish(job.id, 'cancelled', null, job.prepare ? 'Cancelled before Siril started.' : 'Cancelled before it started.')
      return
    }
    entry.process = deps.runner.run(command, text => deps.logs.append(job.id, text))
    const result = await entry.process.done
    if (stopping) return
    if (entry.cancelled) await finish(job.id, 'cancelled', result.exitCode, 'Cancelled while it ran.')
    else if (result.exitCode === 0) await finish(job.id, 'succeeded', 0, null)
    else await finish(job.id, 'failed', result.exitCode, result.error ?? `${command.program} exited with code ${result.exitCode ?? 'unknown'}.`)
  }

  /**
   * The entry is registered before anything is awaited, so a quit or cancel arriving while the job
   * starts still finds it; the job only moves to running if it is still queued at that moment.
   */
  const launch = (job: Job) => {
    const entry: Entry = { process: null, cancelled: false, finished: Promise.resolve() }
    active.set(job.id, entry)
    entry.finished = (async () => {
      if (stopping || entry.cancelled) return
      const started = await deps.store.transition(job.id, 'queued', {
        state: 'running',
        startedAt: deps.clock.now(),
        finishedAt: null,
        exitCode: null,
        note: null,
        attempts: job.attempts + 1
      })
      if (!started) return
      deps.onChange?.()
      await run(started, entry)
    })()
      .catch(async error => {
        if (!stopping) await finish(job.id, 'failed', null, error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        active.delete(job.id)
        deps.onChange?.()
      })
  }

  const require = async (jobId: string) => {
    const job = await deps.store.get(jobId)
    if (!job) throw new JobStateError('That job no longer exists.')
    return job
  }

  return {
    snapshot,

    list: () => deps.store.list(),

    async tick() {
      const snap = await snapshot()
      const job = snap.jobs.find(j => j.id === snap.schedule.start)
      if (!job || stopping || active.size > 0) return snap
      launch(job)
      return snap
    },

    async cancel(jobId) {
      const job = await require(jobId)
      if (job.state === 'queued') {
        const entry = active.get(jobId)
        if (entry) entry.cancelled = true
        const cancelled = await deps.store.transition(jobId, 'queued', { state: 'cancelled', note: 'Cancelled before it started.', finishedAt: deps.clock.now() })
        if (cancelled) return cancelled
      }
      // Running, or it started while the cancel was on its way.
      const entry = active.get(jobId)
      if (!entry) {
        const now = await require(jobId)
        throw new JobStateError(`The job has already ${now.state === 'running' ? 'stopped' : now.state}.`)
      }
      entry.cancelled = true
      entry.process?.cancel()
      await entry.finished
      return require(jobId)
    },

    async runNow(jobId) {
      const moved = await deps.store.transition(jobId, 'queued', { timing: 'now' })
      if (!moved) {
        await require(jobId)
        throw new JobStateError('Only a queued job can be moved ahead.')
      }
      deps.onChange?.()
      return moved
    },

    async recover() {
      for (const job of await deps.store.list()) {
        if (job.state !== 'running' || active.has(job.id)) continue
        const next = afterInterruption(job)
        await deps.store.update(job.id, { state: next.state, note: next.note, finishedAt: next.state === 'failed' ? deps.clock.now() : null })
        deps.logs.append(job.id, `\n${deps.clock.now().toISOString()} ${next.note}\n`)
      }
    },

    shutdown() {
      stopping = true
      for (const entry of active.values()) entry.process?.cancel()
    },

    log: (jobId, maxBytes = 64 * 1024) => deps.logs.read(jobId, maxBytes),

    busy: () => active.size > 0,

    async clear() {
      for (const entry of active.values()) {
        entry.cancelled = true
        entry.process?.cancel()
      }
      while (active.size > 0) await Promise.all([...active.values()].map(e => e.finished))
    },

    async idle() {
      while (active.size > 0) await Promise.all([...active.values()].map(e => e.finished))
    }
  }
}
