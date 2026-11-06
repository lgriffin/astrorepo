import { performance } from 'perf_hooks'
import { GENTLE_SCAN, restAfter, type ScanPacing } from '@astro/domain'

/** Thrown at a checkpoint once the scan has been asked to stop. */
export class ScanCancelled extends Error {
  constructor() {
    super('Scan cancelled')
    this.name = 'ScanCancelled'
  }
}

/**
 * Milliseconds the main process has spent running code since it started, not counting time spent
 * idle waiting for the disk, the network or a timer. Only that time holds the app up.
 */
export function mainProcessBusyMs(): number {
  return performance.eventLoopUtilization().active
}

/** Files asked of the disk at once: enough to hide each call's wait, too few to flood a disk or a NAS. */
export const FILES_IN_FLIGHT = 4

/**
 * Keeps a long scan gentle: call `checkpoint` between small pieces of work. It rests once a slice
 * of work is used up (NFR-013) and stops the scan when it has been cancelled (ING-014).
 *
 * A slice is measured in the main process's busy time, not the clock's (NFR-022): waiting for a
 * file to open or a header to arrive holds nothing up, so it is not rested for. On Windows each
 * open and stat waits a few milliseconds even on a local disk, and resting for that wait as if it
 * were work made a library of 20,000 files take most of an hour.
 */
export class ScanPacer {
  private sliceStart: number

  constructor(
    private readonly signal?: AbortSignal,
    private readonly pacing: ScanPacing = GENTLE_SCAN,
    private readonly busyNow: () => number = mainProcessBusyMs,
    private readonly sleep: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))
  ) {
    this.sliceStart = busyNow()
  }

  get cancelled(): boolean {
    return this.signal?.aborted ?? false
  }

  async checkpoint(): Promise<void> {
    if (this.cancelled) throw new ScanCancelled()
    const rest = restAfter(this.busyNow() - this.sliceStart, this.pacing)
    if (rest > 0) {
      await this.sleep(rest)
      this.sliceStart = this.busyNow()
      if (this.cancelled) throw new ScanCancelled()
    }
  }
}

/**
 * Runs `work` for each index below `count`, at most `limit` at once, with a checkpoint after each
 * (NFR-022). Waits for every piece under way to stop before it settles; a cancel (or any failure)
 * is then thrown, after the pieces already finished have done their work.
 */
export async function inFlight(count: number, limit: number, work: (index: number) => Promise<void>, pacer: ScanPacer): Promise<void> {
  let next = 0
  let stopped = false
  const worker = async (): Promise<void> => {
    try {
      while (!stopped && next < count) {
        const index = next++
        await work(index)
        await pacer.checkpoint()
      }
    } catch (err) {
      // The others finish the piece they hold and take no more.
      stopped = true
      throw err
    }
  }
  const settled = await Promise.allSettled(Array.from({ length: Math.min(limit, count) }, worker))
  const failed = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected')
  if (failed) throw failed.reason
}
