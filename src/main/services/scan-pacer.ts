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
 * Keeps a long scan gentle: call `checkpoint` between small pieces of work. It rests once a slice
 * of work is used up (NFR-013) and stops the scan when it has been cancelled (ING-014).
 */
export class ScanPacer {
  private sliceStart: number

  constructor(
    private readonly signal?: AbortSignal,
    private readonly pacing: ScanPacing = GENTLE_SCAN,
    private readonly now: () => number = () => performance.now(),
    private readonly sleep: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))
  ) {
    this.sliceStart = now()
  }

  get cancelled(): boolean {
    return this.signal?.aborted ?? false
  }

  async checkpoint(): Promise<void> {
    if (this.cancelled) throw new ScanCancelled()
    const rest = restAfter(this.now() - this.sliceStart, this.pacing)
    if (rest > 0) {
      await this.sleep(rest)
      this.sliceStart = this.now()
      if (this.cancelled) throw new ScanCancelled()
    }
  }
}
