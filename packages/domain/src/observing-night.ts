const HALF_DAY_MS = 12 * 60 * 60 * 1000

/**
 * The observing night a frame belongs to, as the calendar date the night started on.
 * Shifting by 12 hours keeps a session that crosses midnight in one night. It uses UTC
 * because sites (and their time zones) are not modelled yet; slice D replaces this.
 */
export function observingNightOf(capturedAt: Date): string {
  return new Date(capturedAt.getTime() - HALF_DAY_MS).toISOString().slice(0, 10)
}
