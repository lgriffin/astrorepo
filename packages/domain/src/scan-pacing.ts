/**
 * How a long scan shares the PC. The scan works in short slices and rests between them, so the
 * app stays responsive and the disk and CPU are left free for everything else. Time is not the
 * constraint on a big library; staying out of the way is.
 */
export interface ScanPacing {
  /** The longest stretch of work before the scan stops to let the app and the PC breathe. */
  sliceMs: number
  /** The share of wall time the scan may work, between 0 (exclusive) and 1. */
  dutyCycle: number
}

/** Works at most a fifth of a second in any half second, a slice at a time. */
export const GENTLE_SCAN: ScanPacing = { sliceMs: 25, dutyCycle: 0.4 }

/**
 * How long to rest after `busyMs` of uninterrupted work: nothing until a slice is used up, then
 * long enough that the work takes `dutyCycle` of the time.
 */
export function restAfter(busyMs: number, pacing: ScanPacing): number {
  if (busyMs < pacing.sliceMs) return 0
  const duty = Math.min(1, Math.max(0.01, pacing.dutyCycle))
  return Math.ceil(busyMs * (1 - duty) / duty)
}

/** Files read, and seconds spent reading them, before a scan says how long it has left (ING-016). */
export const TIME_LEFT_AFTER = { files: 50, seconds: 5 }

/**
 * Seconds a scan still needs to read its remaining files at the pace it has kept so far, or null
 * while too little has been read to tell, and once everything is read (ING-016).
 */
export function readingSecondsLeft(filesRead: number, filesToRead: number, elapsedMs: number): number | null {
  if (filesRead >= filesToRead) return null
  if (filesRead < TIME_LEFT_AFTER.files || elapsedMs < TIME_LEFT_AFTER.seconds * 1000) return null
  return Math.ceil((filesToRead - filesRead) * (elapsedMs / 1000) / filesRead)
}
