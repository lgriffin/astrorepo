import { app, powerMonitor, powerSaveBlocker } from 'electron'
import type { JobsHostEnvironment } from '../jobs-host'

/** The job runner's view of this PC through Electron (specs/035-pi-variant, PI-005). */
export function electronJobsEnvironment(): JobsHostEnvironment {
  return {
    dataFolder: app.getPath('userData'),
    userIdleSeconds: () => powerMonitor.getSystemIdleTime(),
    preventSleep: () => powerSaveBlocker.start('prevent-app-suspension'),
    allowSleep: handle => powerSaveBlocker.stop(handle),
    onQuit: listener => app.on('before-quit', listener)
  }
}
