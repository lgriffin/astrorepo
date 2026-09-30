import { app, powerMonitor, powerSaveBlocker } from 'electron'
import path from 'path'
import type { JobScheduler } from '@astro/application'
import { composeJobs } from './composition'
import { getSqlite } from './db/connection'

/** How often the queue is checked against the run window and the PC's load. */
const TICK_MS = 60_000

let scheduler: JobScheduler | null = null
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
  const busy = scheduler?.busy() ?? false
  if (busy && blocker === null) blocker = powerSaveBlocker.start('prevent-app-suspension')
  if (!busy && blocker !== null) {
    powerSaveBlocker.stop(blocker)
    blocker = null
  }
}

/** Starts the job runner: recovers jobs the last session left running, then checks every minute. */
export async function startJobs(readOnlyDirs: () => string[]): Promise<JobScheduler> {
  scheduler = composeJobs(getSqlite(), {
    logsDir: path.join(app.getPath('userData'), 'jobs'),
    userIdleSeconds: () => powerMonitor.getSystemIdleTime(),
    readOnlyDirs,
    onChange: () => {
      holdAwake()
      setTimeout(kickJobs, 0)
    }
  })
  await scheduler.recover()
  const timer = setInterval(kickJobs, TICK_MS)
  app.on('before-quit', () => {
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
