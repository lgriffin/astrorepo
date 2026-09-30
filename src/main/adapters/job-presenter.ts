import type { JobsSnapshot } from '@astro/application'
import { estimateJobSeconds, formatClock, jobHistory, type Job, type JobEstimate, type WaitReason } from '@astro/domain'
import type { JobsView, JobView } from '@shared/types'
import { formatBytes } from './discovery-presenter'

const HISTORY_SHOWN = 20

const STATE_LABEL: Record<Job['state'], string> = { queued: 'Queued', running: 'Running', succeeded: 'Done', failed: 'Failed', cancelled: 'Cancelled' }

/** "45 min", "2 h 10 min", "under a minute". */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return 'under a minute'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

const localClock = (d: Date) => formatClock(d.getHours() * 60 + d.getMinutes())

/** "02:00 today", "02:00 tomorrow", or the date for anything further off. */
export function when(at: Date, now: Date): string {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(at) - day(now)) / 86_400_000)
  const date = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `on ${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
  return `${localClock(at)} ${date}`
}

export function waitText(wait: WaitReason, estimate: JobEstimate, now: Date): string {
  switch (wait.code) {
    case 'running':
      return 'Waits for the running job to finish.'
    case 'behind':
      return 'Waits for the job ahead of it.'
    case 'space':
      return `Waits for disk space: ${formatBytes(wait.shortBytes)} short where it writes.`
    case 'space-unknown':
      return 'Waits until the disk it writes to reports its free space.'
    case 'window':
      return `Waits for the run window at ${when(wait.opensAt, now)}.`
    case 'idle':
      return `Waits until the PC has been idle for ${wait.idleMinutes} minutes (last used ${formatDuration(wait.idleSeconds)} ago).`
    case 'cpu':
      return `Waits for CPU use to drop below ${wait.maxCpuPercent}% (now ${wait.cpuPercent}%).`
    case 'overrun':
      return `Would run past ${localClock(wait.closesAt)} (about ${formatDuration(estimate.seconds)}, with ${formatDuration(wait.leftSeconds)} left), so it waits for the window at ${when(wait.opensAt, now)}.`
  }
}

const estimateText = (e: JobEstimate) => `About ${formatDuration(e.seconds)}${e.basis === 'guess' ? ' (a first-run guess until this PC has run one)' : ', from earlier runs'}`

const quote = (a: string) => (/[\s"']/.test(a) ? `"${a}"` : a)

function toJobView(job: Job, now: Date, extra: { estimate: JobEstimate | null; waiting: string | null }): JobView {
  const end = job.finishedAt ?? (job.state === 'running' ? now : null)
  return {
    id: job.id,
    targetId: job.targetId,
    title: job.title,
    kind: job.kind,
    state: job.state,
    stateLabel: STATE_LABEL[job.state],
    timing: job.timing,
    queuedAt: job.queuedAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    duration: job.startedAt && end ? formatDuration((end.getTime() - job.startedAt.getTime()) / 1000) : null,
    estimate: extra.estimate ? estimateText(extra.estimate) : null,
    waiting: extra.waiting,
    note: job.note,
    command: [job.command.program, ...job.command.args].map(quote).join(' '),
    needed: formatBytes(job.neededBytes),
    canCancel: job.state === 'queued' || job.state === 'running',
    canRunNow: job.state === 'queued' && job.timing === 'window'
  }
}

/** The queue for the Jobs page. `now` is the clock the snapshot was taken by. */
/**
 * `historyFor` picks one target's finished jobs before the history is cut to its newest few, so a
 * busy other target never hides them (the target page's Runs step, UX-011).
 */
export function toJobsView(snap: JobsSnapshot, now: Date, historyFor?: string): JobsView {
  const { schedule, settings, load, jobs } = snap
  const byId = new Map(jobs.map(j => [j.id, j]))
  const window = `${formatClock(settings.windowStart)} and ${formatClock(settings.windowEnd)}`
  const rules =
    settings.windowStart === settings.windowEnd
      ? `Jobs start at any time once the PC has been idle for ${settings.idleMinutes} minutes and CPU use is below ${settings.maxCpuPercent}%. One runs at a time, at low priority.`
      : `Jobs start between ${window} once the PC has been idle for ${settings.idleMinutes} minutes and CPU use is below ${settings.maxCpuPercent}%. One runs at a time, at low priority, and a job running at the close is left to finish.`
  const w = schedule.window
  const windowStatus = w.open
    ? w.closesAt
      ? `The run window is open until ${localClock(w.closesAt)}.`
      : 'The run window is open all day.'
    : `The next run window opens at ${when(w.opensAt, now)}.`
  const loadParts = [
    load.userIdleSeconds === null ? null : `last used ${formatDuration(load.userIdleSeconds)} ago`,
    load.cpuPercent === null ? null : `CPU at ${load.cpuPercent}%`
  ].filter(Boolean)
  const running = jobs.find(j => j.state === 'running') ?? null
  return {
    rules,
    windowStatus,
    load: loadParts.length > 0 ? `The PC was ${loadParts.join(', with ')}.` : null,
    running: running ? toJobView(running, now, { estimate: estimateJobSeconds(running.kind, running.neededBytes, jobHistory(jobs)), waiting: null }) : null,
    queue: schedule.queue.map(q => {
      const job = byId.get(q.jobId) as Job
      return toJobView(job, now, { estimate: q.estimate, waiting: q.wait ? waitText(q.wait, q.estimate, now) : 'Starting now.' })
    }),
    history: jobs
      .filter(j => j.state !== 'queued' && j.state !== 'running' && (historyFor === undefined || j.targetId === historyFor))
      .sort((a, b) => (b.finishedAt?.getTime() ?? 0) - (a.finishedAt?.getTime() ?? 0))
      .slice(0, HISTORY_SHOWN)
      .map(j => toJobView(j, now, { estimate: null, waiting: null })),
    settings: {
      windowStart: formatClock(settings.windowStart),
      windowEnd: formatClock(settings.windowEnd),
      idleMinutes: settings.idleMinutes,
      maxCpuPercent: settings.maxCpuPercent
    }
  }
}
