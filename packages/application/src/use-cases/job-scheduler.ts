import {
  afterInterruption,
  explainSirilFailure,
  FAILED_FOLDER,
  interpretExit,
  jobHistory,
  parseLiveProgress,
  runToolOf,
  newResults,
  resumeFrom,
  runKey,
  scheduleJobs,
  sirilStackCommand,
  splitSirilScript,
  stackManifest,
  stepScript,
  stockScriptOf,
  storeResults,
  storedResults,
  type Job,
  type JobSettings,
  type MachineLoad,
  type Schedule,
  type StepProgress
} from '@astro/domain'
import type { RunArea } from '../ports/run-area'
import type { TargetHolds } from './target-holds'
import type { Clock } from '../ports/clock'
import type { JobLogs, JobSettingsSource, JobStore, MachineMonitor, ProcessRunner, RunningProcess } from '../ports/jobs'
import type { SirilWorkspace } from '../ports/siril-workspace'
import type { PrepareSirilWorkspace, SirilWorkspaceResult } from './prepare-siril-workspace'

export interface JobSchedulerDeps {
  store: JobStore
  settings: JobSettingsSource
  machine: MachineMonitor
  runner: ProcessRunner
  logs: JobLogs
  /** Free space where a job writes, and the stacks a run leaves there. */
  workspace: Pick<SirilWorkspace, 'workAreaSpace'> & Partial<Pick<SirilWorkspace, 'stackResults' | 'inputFrames'>>
  /**
   * When wired, a stack job runs Siril's stock script a step at a time, carries on after an
   * interruption, publishes a result only when every step succeeded, and writes its manifest
   * (specs/021-provenance). Without it the script runs whole.
   */
  runArea?: RunArea
  /** The target's name, for manifests. */
  targetName?: (targetId: string) => Promise<string | null>
  /** Lays a stack job's frames out before Siril runs. */
  prepare: PrepareSirilWorkspace
  /** Folders the app only reads, which a work area must not overlap. */
  readOnlyDirs: () => string[] | Promise<string[]>
  clock: Clock
  /** Called whenever a job starts or finishes, so the host can check the queue again. */
  onChange?: () => void
  /** Targets an archive is working on; their jobs wait until it lets go (ARC-008). */
  holds?: Pick<TargetHolds, 'held'>
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

  const stopsHere = async (job: Job, entry: Entry, note: { prepare: boolean }) => {
    if (stopping) return true
    if (!entry.cancelled) return false
    await finish(job.id, 'cancelled', null, note.prepare ? 'Cancelled before Siril started.' : 'Cancelled before it started.')
    return true
  }

  /** Why a run failed: the program's own reason, and what a known Siril message means (PRV-006). */
  const failureNote = async (job: Job, base: string) => {
    const known = job.kind === 'syqon' ? null : explainSirilFailure(await deps.logs.read(job.id, 16 * 1024))
    if (!known) return base
    deps.logs.append(job.id, `\nWhat this usually means: ${known.reason} ${known.fix}\n`)
    return `${base} ${known.reason} ${known.fix}`
  }

  /** A failure that will happen again until something changes says so (HUB-012). */
  const notRetryable = (retryable: boolean) => (retryable ? '' : ' Queueing it again will fail the same way until that is fixed.')

  /**
   * Live progress from a tool that reports its own (SyQon on stderr, HUB-011): its percentage when
   * it prints simple percentages, else its last line. Saved when the whole percent changes, or a
   * line at most every few seconds, so the store is not written on every chunk.
   */
  const liveProgress = (job: Job) => {
    let lastPercent: number | null = null
    let lastSaved = 0
    let pending: Promise<unknown> = Promise.resolve()
    const save = (text: string) => {
      const live = parseLiveProgress(text)
      if (!live) return
      const now = deps.clock.now().getTime()
      const percent = live.percent === null ? null : Math.floor(live.percent)
      const changed = percent !== null ? percent !== lastPercent : now - lastSaved >= 3000
      if (!changed) return
      lastPercent = percent
      lastSaved = now
      const progress: StepProgress = { step: 0, of: 1, key: 'live', label: job.title, live: { percent: live.percent, line: live.line } }
      pending = pending.then(() => deps.store.update(job.id, { progress })).catch(() => undefined)
    }
    return { save, settled: () => pending }
  }

  const run = async (job: Job, entry: Entry) => {
    const { command } = job
    deps.logs.append(job.id, `${deps.clock.now().toISOString()} started ${job.title}\n> ${[command.program, ...command.args].join(' ')}\n\n`)
    let prep: SirilWorkspaceResult | null = null
    if (job.prepare) {
      try {
        prep = await deps.prepare(job.prepare.sourceDir, job.prepare.workDir, await deps.readOnlyDirs())
        const graded = prep.rejected > 0 ? ` ${prep.rejected} ${prep.rejected === 1 ? 'light' : 'lights'} rejected by frame grading left out.` : ''
        const pruned = prep.pruned > 0 ? ` ${prep.pruned} ${prep.pruned === 1 ? 'file' : 'files'} from an earlier run removed from the work area.` : ''
        deps.logs.append(job.id, `Prep for Siril: ${prep.linked} linked, ${prep.copied} copied, ${prep.existing} already in place.${graded}${pruned}\n\n`)
      } catch (error) {
        if (!stopping) await finish(job.id, entry.cancelled ? 'cancelled' : 'failed', null, error instanceof Error ? error.message : String(error))
        return
      }
    }
    // Checked again right before the program starts: a cancel or quit may have come in meanwhile.
    if (await stopsHere(job, entry, { prepare: job.prepare !== null })) return

    const stock = job.kind === 'stack' && prep ? stockScriptOf(command) : null
    if (stock && deps.runArea && deps.workspace.stackResults) {
      const text = await deps.runArea.readText(stock.script).catch(() => null)
      const steps = text === null ? null : splitSirilScript(text)
      if (text !== null && steps) return runSteps(job, entry, { ...stock, text, steps, prep: prep as SirilWorkspaceResult })
      deps.logs.append(job.id, 'The script could not be split into steps, so it runs whole and cannot carry on after an interruption.\n\n')
    }

    const live = job.kind === 'syqon' ? liveProgress(job) : null
    let stdout = ''
    entry.process = deps.runner.run(command, (text, stream) => {
      deps.logs.append(job.id, text)
      if (stream === 'stdout') stdout += text
      else if (live && (stream === 'stderr' || stream === undefined)) live.save(text)
    })
    const result = await entry.process.done
    await live?.settled()
    if (stopping) return
    // One exit-code contract for every tool (HUB-012).
    const tool = runToolOf(job.kind)
    const verdict = interpretExit(tool, result.exitCode, { cancelled: entry.cancelled, program: tool === 'syqon' ? undefined : command.program })
    if (verdict.outcome === 'succeeded') {
      const wrote = stdout.trim().split(/\r?\n/).pop()
      if (wrote) deps.logs.append(job.id, `\nWrote ${wrote}.\n`)
      await finish(job.id, 'succeeded', result.exitCode, null)
    } else if (verdict.outcome === 'cancelled') await finish(job.id, 'cancelled', result.exitCode, verdict.message)
    else {
      // The runner's own reason when the program never gave a code (it could not start, or was killed).
      const base = result.error && result.exitCode === null ? result.error : verdict.message
      await finish(job.id, 'failed', result.exitCode, `${await failureNote(job, base)}${notRetryable(verdict.retryable)}`)
    }
  }

  /**
   * A stack run a step at a time (PRV-002 to PRV-005). Each step is its own Siril run from the work
   * folder; what the steps finished is saved, so after an interruption the same script over the
   * same frames carries on from the next one. A result is published, with its manifest, only when
   * every step succeeded; otherwise what the run wrote is set aside in failed/.
   */
  const runSteps = async (
    job: Job,
    entry: Entry,
    run: { program: string; workDir: string; script: string; text: string; steps: NonNullable<ReturnType<typeof splitSirilScript>>; prep: SirilWorkspaceResult }
  ) => {
    const area = deps.runArea as RunArea
    const results = deps.workspace.stackResults as NonNullable<typeof deps.workspace.stackResults>
    const inputs = deps.workspace.inputFrames ? await deps.workspace.inputFrames(run.workDir) : undefined
    const key = runKey(run.text, run.prep.placements, inputs)
    const from = resumeFrom(job.progress, key, run.steps.length)
    const earlier = job.progress?.baseline ? storedResults(job.progress.baseline) : null
    if (from === 0 && earlier) {
      // An earlier attempt of this job stopped part way; what it wrote is not a finished stack.
      const left = newResults(earlier, await results(run.workDir)).map(r => r.path)
      if (left.length > 0) {
        const moved = await area.setAside(run.workDir, job.id, left)
        deps.logs.append(job.id, `Set aside in ${FAILED_FOLDER} what the earlier attempt wrote: ${moved.join(', ')}.\n`)
      }
    }
    // Results already there belong to earlier stacks: never republished, never set aside.
    const before = from > 0 ? (earlier ?? []) : await results(run.workDir)
    const baseline = storeResults(before)
    const timings: { label: string; seconds: number | null; resumed: boolean }[] = run.steps.map((s, i) => ({ label: s.label, seconds: null, resumed: i < from }))
    if (from > 0) deps.logs.append(job.id, `Carrying on from step ${from + 1} of ${run.steps.length}: steps 1 to ${from} finished in an earlier run over the same frames.\n\n`)
    else if (job.progress) deps.logs.append(job.id, 'Starting from the first step: the script or the frames changed since the earlier run.\n\n')
    const progress = (step: number, extra: Partial<StepProgress> = {}): StepProgress => ({
      step,
      of: run.steps.length,
      key,
      label: run.steps[step]?.label ?? null,
      ...(from > 0 ? { resumedFrom: from } : {}),
      baseline,
      ...extra
    })

    const setAside = async (note: string) => {
      const partial = newResults(before, await results(run.workDir)).map(r => r.path)
      if (partial.length === 0) return note
      const moved = await area.setAside(run.workDir, job.id, partial)
      deps.logs.append(job.id, `\nSet aside in ${FAILED_FOLDER}: ${moved.join(', ')}, so it is never taken for a finished stack.\n`)
      return `${note} What it wrote is in the work folder's ${FAILED_FOLDER} folder.`
    }
    const cancelled = async (when: string) => finish(job.id, 'cancelled', null, await setAside(`Cancelled ${when}.`))

    for (let i = from; i < run.steps.length; i++) {
      const step = run.steps[i]
      await deps.store.update(job.id, { progress: progress(i) })
      deps.onChange?.()
      const path = await area.writeStep(run.workDir, `step-${String(i + 1).padStart(2, '0')}.ssf`, stepScript(step))
      // A quit or cancel that came while the step was being written stops it before it starts.
      if (stopping) return
      if (entry.cancelled) return cancelled(`before step ${i + 1} of ${run.steps.length} (${step.label})`)
      deps.logs.append(job.id, `── Step ${i + 1} of ${run.steps.length}: ${step.label}\n`)
      const started = deps.clock.now().getTime()
      entry.process = deps.runner.run(sirilStackCommand(run.program, path, run.workDir), text => deps.logs.append(job.id, text))
      const result = await entry.process.done
      // Quitting leaves the progress saved, so the next start carries on from this step.
      if (stopping) return
      timings[i].seconds = Math.round((deps.clock.now().getTime() - started) / 1000)
      if (entry.cancelled) {
        await finish(job.id, 'cancelled', result.exitCode, await setAside(`Cancelled during step ${i + 1} of ${run.steps.length} (${step.label}).`))
        return
      }
      const verdict = interpretExit('siril', result.exitCode, { cancelled: false })
      if (verdict.outcome !== 'succeeded') {
        const base = `Step ${i + 1} of ${run.steps.length} (${step.label}) failed: ${result.error ?? verdict.message}`
        await finish(job.id, 'failed', result.exitCode, `${await setAside(await failureNote(job, base))}${notRetryable(verdict.retryable)}`)
        return
      }
      await deps.store.update(job.id, { progress: progress(i + 1) })
    }

    if (stopping) return
    if (entry.cancelled) return cancelled('after its last step, before its result was published')
    let published: Awaited<ReturnType<typeof results>>
    try {
      const finishedAt = deps.clock.now()
      published = newResults(before, await results(run.workDir))
      const name = deps.targetName ? await deps.targetName(job.targetId) : null
      for (const result of published) {
        const manifest = stackManifest({
          result,
          target: { id: job.targetId, name },
          job: { id: job.id, title: job.title, startedAt: job.startedAt },
          finishedAt,
          program: run.program,
          script: run.script,
          steps: timings,
          placements: run.prep.placements,
          inputs,
          rejected: run.prep.rejectedPaths
        })
        deps.logs.append(job.id, `\nPublished ${result.path} with its manifest ${await area.writeManifest(result.path, manifest)}.\n`)
      }
      // A cancel that came while publishing wins: the result and its manifest are set aside.
      if (entry.cancelled) {
        await deps.store.update(job.id, { progress: progress(run.steps.length) })
        return cancelled('while its result was being published')
      }
      if (stopping) return
      await deps.store.update(job.id, { progress: progress(run.steps.length, { published: published.map(r => r.path) }) })
    } catch (error) {
      // Never a result without its manifest: set it aside with whatever was written beside it.
      const reason = error instanceof Error ? error.message : String(error)
      await finish(job.id, 'failed', 0, await setAside(`Siril finished, but publishing the result failed: ${reason.replace(/\.?$/, '.')}`))
      return
    }
    await finish(job.id, 'succeeded', 0, published.length === 0 ? 'Siril finished, but no result file appeared in the work folder.' : null)
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
      if (!job || stopping || active.size > 0 || deps.holds?.held(job.targetId)) return snap
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
