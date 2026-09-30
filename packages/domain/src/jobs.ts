/**
 * The job queue: Siril and Siril_Scripts runs the user confirmed, started one at a time inside a
 * nightly run window while the PC is idle, with how long each will take predicted from earlier
 * runs. Pure rules; running programs and reading the machine's load are adapters' jobs.
 */

export type JobKind = 'stack' | 'post-process'
export type JobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
/** Waits for the run window and an idle PC, or starts as soon as nothing else is running. */
export type JobTiming = 'window' | 'now'

/** A program and its arguments, run directly (never through a shell). */
export interface JobCommand {
  program: string
  args: string[]
  cwd: string
}

export interface Job {
  id: string
  kind: JobKind
  targetId: string
  /** What the job does, in the user's words ("Stack M 42 with OSC_Preprocessing"). */
  title: string
  timing: JobTiming
  state: JobState
  command: JobCommand
  /** A stack job lays the target's frames out in the work area before Siril runs. */
  prepare: { sourceDir: string; workDir: string } | null
  /** Where the job writes, and the disk it needs there at its busiest. */
  spaceDir: string
  neededBytes: number
  queuedAt: Date
  startedAt: Date | null
  finishedAt: Date | null
  exitCode: number | null
  /** Why it failed, was cancelled or was queued again. */
  note: string | null
  /** How many times it has started. */
  attempts: number
}

export type NewJob = Pick<Job, 'kind' | 'targetId' | 'title' | 'timing' | 'command' | 'prepare' | 'spaceDir' | 'neededBytes'>

// ── Settings ────────────────────────────────────────────────────────────

export interface JobSettings {
  /** Local minutes after midnight. A window whose end is before its start runs past midnight; equal means all day. */
  windowStart: number
  windowEnd: number
  /** No keyboard or mouse input for this long before a window job starts. */
  idleMinutes: number
  /** CPU use (all cores) above which a window job waits. */
  maxCpuPercent: number
}

/** Leigh's example: between 2am and 3am. */
export const DEFAULT_JOB_SETTINGS: JobSettings = { windowStart: 120, windowEnd: 180, idleMinutes: 10, maxCpuPercent: 30 }

export const JOB_SETTING_KEYS: Record<keyof JobSettings, string> = {
  windowStart: 'job_window_start',
  windowEnd: 'job_window_end',
  idleMinutes: 'job_idle_minutes',
  maxCpuPercent: 'job_max_cpu_percent'
}

/** "02:00" as minutes after midnight; null when it is not a 24-hour time. */
export function parseClock(text: string | null | undefined): number | null {
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(text ?? '')
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  return h < 24 && min < 60 ? h * 60 + min : null
}

export function formatClock(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** The saved settings, each falling back to its default when missing or out of range. */
export function parseJobSettings(read: (key: string) => string | null): JobSettings {
  const number = (key: string, min: number, max: number, fallback: number) => {
    const raw = read(key)
    const n = raw === null || raw.trim() === '' ? NaN : Number(raw)
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback
  }
  return {
    windowStart: parseClock(read(JOB_SETTING_KEYS.windowStart)) ?? DEFAULT_JOB_SETTINGS.windowStart,
    windowEnd: parseClock(read(JOB_SETTING_KEYS.windowEnd)) ?? DEFAULT_JOB_SETTINGS.windowEnd,
    idleMinutes: number(JOB_SETTING_KEYS.idleMinutes, 0, 240, DEFAULT_JOB_SETTINGS.idleMinutes),
    maxCpuPercent: number(JOB_SETTING_KEYS.maxCpuPercent, 1, 100, DEFAULT_JOB_SETTINGS.maxCpuPercent)
  }
}

// ── The run window ──────────────────────────────────────────────────────

export interface WindowState {
  open: boolean
  /** When it next opens: now while open. */
  opensAt: Date
  /** When the current or next opening closes; null for an all-day window. */
  closesAt: Date | null
  /** The window's length in seconds; null for an all-day window. */
  lengthSeconds: number | null
}

const at = (day: Date, dayOffset: number, minute: number) =>
  new Date(day.getFullYear(), day.getMonth(), day.getDate() + dayOffset, Math.floor(minute / 60), minute % 60)

/** Where `now` (local time) falls against the run window. */
export function windowState(now: Date, settings: Pick<JobSettings, 'windowStart' | 'windowEnd'>): WindowState {
  const { windowStart: start, windowEnd: end } = settings
  if (start === end) return { open: true, opensAt: now, closesAt: null, lengthSeconds: null }
  const minute = now.getHours() * 60 + now.getMinutes()
  const crosses = end < start
  const lengthSeconds = ((end - start + 1440) % 1440) * 60
  if (!crosses) {
    if (minute >= start && minute < end) return { open: true, opensAt: now, closesAt: at(now, 0, end), lengthSeconds }
    const day = minute < start ? 0 : 1
    return { open: false, opensAt: at(now, day, start), closesAt: at(now, day, end), lengthSeconds }
  }
  if (minute >= start) return { open: true, opensAt: now, closesAt: at(now, 1, end), lengthSeconds }
  if (minute < end) return { open: true, opensAt: now, closesAt: at(now, 0, end), lengthSeconds }
  return { open: false, opensAt: at(now, 0, start), closesAt: at(now, 1, end), lengthSeconds }
}

// ── How long a job takes ────────────────────────────────────────────────

/** A finished run, for predicting the next. */
export interface JobRun {
  kind: JobKind
  neededBytes: number
  seconds: number
}

/**
 * First-run guesses until the PC has a history: Siril stacking a colour target runs at roughly a
 * minute and a half per GB it writes; Siril_Scripts with RC Astro's AI tools runs far slower per GB.
 */
export const GUESS_SECONDS_PER_GB: Record<JobKind, number> = { stack: 90, 'post-process': 900 }
const MIN_SECONDS = 60
const HISTORY_RUNS = 5
const GB = 1024 ** 3

export interface JobEstimate {
  seconds: number
  /** From this PC's last runs of the same kind, or the first-run guess. */
  basis: 'history' | 'guess'
}

/** Finished runs, oldest first, from the jobs that succeeded. */
export function jobHistory(jobs: Job[]): JobRun[] {
  return jobs
    .filter(j => j.state === 'succeeded' && j.startedAt && j.finishedAt)
    .sort((a, b) => (a.finishedAt?.getTime() ?? 0) - (b.finishedAt?.getTime() ?? 0))
    .map(j => ({ kind: j.kind, neededBytes: j.neededBytes, seconds: ((j.finishedAt?.getTime() ?? 0) - (j.startedAt?.getTime() ?? 0)) / 1000 }))
}

/** Seconds a job will take: this PC's recent rate per GB for the kind, else the first-run guess. */
export function estimateJobSeconds(kind: JobKind, neededBytes: number, history: JobRun[]): JobEstimate {
  const runs = history.filter(r => r.kind === kind && r.neededBytes > 0 && r.seconds > 0).slice(-HISTORY_RUNS)
  const gb = neededBytes / GB
  if (runs.length === 0) return { seconds: Math.max(MIN_SECONDS, Math.round(gb * GUESS_SECONDS_PER_GB[kind])), basis: 'guess' }
  const rate = runs.reduce((s, r) => s + r.seconds, 0) / runs.reduce((s, r) => s + r.neededBytes / GB, 0)
  return { seconds: Math.max(MIN_SECONDS, Math.round(gb * rate)), basis: 'history' }
}

// ── What starts next ────────────────────────────────────────────────────

export interface MachineLoad {
  /** Seconds since the last keyboard or mouse input; null when the system will not say. */
  userIdleSeconds: number | null
  /** CPU use across all cores, 0 to 100; null when unknown. */
  cpuPercent: number | null
}

/** Why a queued job is not starting. */
export type WaitReason =
  | { code: 'running' }
  | { code: 'behind' }
  | { code: 'space'; shortBytes: number }
  | { code: 'space-unknown' }
  | { code: 'window'; opensAt: Date }
  | { code: 'idle'; idleMinutes: number; idleSeconds: number }
  | { code: 'cpu'; maxCpuPercent: number; cpuPercent: number }
  | { code: 'overrun'; closesAt: Date; leftSeconds: number; opensAt: Date }

export interface QueueEntry {
  jobId: string
  estimate: JobEstimate
  /** Null for the job starting now. */
  wait: WaitReason | null
}

export interface ScheduleInput {
  now: Date
  settings: JobSettings
  jobs: Job[]
  history: JobRun[]
  load: MachineLoad
  /** Free bytes where each queued job writes, by job id; missing or null when the disk would not say. */
  freeBytes: Record<string, number | null>
}

export interface Schedule {
  /** The job to start now, if any. */
  start: string | null
  /** Queued jobs in the order they run, each with its estimate and why it waits. */
  queue: QueueEntry[]
  window: WindowState
}

/** Run now first, then the order they were queued. */
export function queueOrder(jobs: Job[]): Job[] {
  return jobs
    .filter(j => j.state === 'queued')
    .sort((a, b) => Number(b.timing === 'now') - Number(a.timing === 'now') || a.queuedAt.getTime() - b.queuedAt.getTime())
}

/**
 * Which queued job starts now. One at a time. A Run now job starts as soon as nothing else runs;
 * a window job also needs the window open, the PC idle and the CPU quiet. A job predicted to run
 * past the window's close lets a later one that fits go first and waits for the next night,
 * unless it is longer than the whole window, when it would never fit and so starts anyway. Any
 * job waits while its disk lacks the space it needs, or will not say how much it has.
 */
export function scheduleJobs(input: ScheduleInput): Schedule {
  const { now, settings, load } = input
  const window = windowState(now, settings)
  let start: string | null = input.jobs.some(j => j.state === 'running') ? 'running' : null

  const machineWait = (): WaitReason | null => {
    if (!window.open) return { code: 'window', opensAt: window.opensAt }
    if (load.userIdleSeconds !== null && load.userIdleSeconds < settings.idleMinutes * 60) {
      return { code: 'idle', idleMinutes: settings.idleMinutes, idleSeconds: load.userIdleSeconds }
    }
    if (load.cpuPercent !== null && load.cpuPercent > settings.maxCpuPercent) {
      return { code: 'cpu', maxCpuPercent: settings.maxCpuPercent, cpuPercent: load.cpuPercent }
    }
    return null
  }

  const queue = queueOrder(input.jobs).map((job): QueueEntry => {
    const estimate = estimateJobSeconds(job.kind, job.neededBytes, input.history)
    const wait = ((): WaitReason | null => {
      if (start === 'running') return { code: 'running' }
      if (start) return { code: 'behind' }
      // A disk that will not report its free space is not taken to have room.
      const free = input.freeBytes[job.id] ?? null
      if (free === null) return { code: 'space-unknown' }
      if (job.neededBytes > free) return { code: 'space', shortBytes: job.neededBytes - free }
      if (job.timing === 'now') return null
      const machine = machineWait()
      if (machine) return machine
      if (window.closesAt && window.lengthSeconds !== null && estimate.seconds <= window.lengthSeconds) {
        const leftSeconds = Math.floor((window.closesAt.getTime() - now.getTime()) / 1000)
        if (estimate.seconds > leftSeconds) {
          const next = windowState(new Date(window.closesAt.getTime() + 60_000), settings)
          return { code: 'overrun', closesAt: window.closesAt, leftSeconds, opensAt: next.opensAt }
        }
      }
      return null
    })()
    if (!wait) start = job.id
    return { jobId: job.id, estimate, wait }
  })

  return { start: start === 'running' ? null : start, queue, window }
}

// ── After a restart ─────────────────────────────────────────────────────

/** A job that has started this many times and was stopped each time is not started again. */
export const MAX_JOB_ATTEMPTS = 2

/** What becomes of a job that was running when the app closed. */
export function afterInterruption(job: Pick<Job, 'attempts'>): { state: 'queued' | 'failed'; note: string } {
  return job.attempts >= MAX_JOB_ATTEMPTS
    ? { state: 'failed', note: `The app closed while it ran, ${job.attempts} times, so it is not started again. Queue it again to retry.` }
    : { state: 'queued', note: 'The app closed while it ran, so it starts again from the beginning.' }
}

// ── Commands ────────────────────────────────────────────────────────────

/** Siril running a stock preprocessing script over a work folder Prep for Siril laid out. */
export function sirilStackCommand(sirilPath: string, scriptPath: string, workDir: string): JobCommand {
  return { program: sirilPath, args: ['-d', workDir, '-s', scriptPath], cwd: workDir }
}

/**
 * Siril_Scripts v2 for a stack. Its .bat only finds Git Bash and hands everything to
 * postprocess.sh, so the app runs the .sh with bash itself: no Command Prompt, so no characters in
 * a path need refusing. Off Windows the script runs with bash when found, else directly.
 */
export function postProcessCommand(entry: string, args: string[], bashPath: string | null, stackDir: string): JobCommand {
  const script = entry.replace(/\.bat$/i, '.sh')
  return bashPath ? { program: bashPath, args: [script, ...args], cwd: stackDir } : { program: script, args, cwd: stackDir }
}
