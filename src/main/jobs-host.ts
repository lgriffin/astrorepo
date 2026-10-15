import path from 'path'
import type { JobScheduler } from '@astro/application'
import { composeJobs } from './composition'
import { getSqlite } from './db/connection'

/** How often the queue is checked against the run window and the PC's load. */
const TICK_MS = 60_000

/**
 * What the job runner needs from the machine it runs on (specs/035-pi-variant, PI-005): where its
 * logs go, how long the user has been away, a way to keep the machine awake while a job runs, and
 * a call when the app quits. The desktop app answers with Electron; a headless host its own way.
 */
export interface JobsHostEnvironment {
  dataFolder: string
  userIdleSeconds: () => number
  /** False where the run window must never start a job (the headless server, PI-013). */
  windowJobs?: false
  /** Keeps the machine from sleeping; returns a handle for `allowSleep`. */
  preventSleep: () => number
  allowSleep: (handle: number) => void
  onQuit: (listener: () => void) => void
}

let scheduler: JobScheduler | null = null
let environment: JobsHostEnvironment | null = null
let blocker: number | null = null
let ticking = false
let again = false

/** Checks the queue now; a check already under way runs once more when it ends. */
export function kickJobs(): void {
  if (!scheduler) return
  if (ticking) {
    again = true
    return
  }
  ticking = true
  scheduler
    .tick()
    .catch(error => console.error('Job runner check failed', error))
    .finally(() => {
      ticking = false
      if (again) {
        again = false
        kickJobs()
      }
    })
}

/** Keeps the PC from sleeping while a job runs, and lets it sleep again after. */
function holdAwake(): void {
  if (!environment) return
  const busy = scheduler?.busy() ?? false
  if (busy && blocker === null) blocker = environment.preventSleep()
  if (!busy && blocker !== null) {
    environment.allowSleep(blocker)
    blocker = null
  }
}

/** Starts the job runner: recovers jobs the last session left running, then checks every minute. */
export async function startJobs(host: JobsHostEnvironment): Promise<JobScheduler> {
  environment = host
  scheduler = composeJobs(getSqlite(), {
    logsDir: path.join(host.dataFolder, 'jobs'),
    userIdleSeconds: host.userIdleSeconds,
    windowJobs: host.windowJobs,
    onChange: () => {
      holdAwake()
      setTimeout(kickJobs, 0)
    }
  })
  await scheduler.recover()
  const timer = setInterval(kickJobs, TICK_MS)
  host.onQuit(() => {
    clearInterval(timer)
    scheduler?.shutdown()
  })
  kickJobs()
  return scheduler
}

export function jobs(): JobScheduler {
  if (!scheduler) throw new Error('The job runner has not started.')
  return scheduler
}
