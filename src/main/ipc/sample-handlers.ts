import type { ChannelRouter } from '../transport/router'
import type { SampleStatus } from '@shared/sample'
import { validated } from './handlers'

/** What the sample channels need: whether the sample is on, and turning it on or off (both restart the app). */
export interface SampleControl {
  status: () => SampleStatus
  start: () => { ok: true } | { ok: false; error: string }
  leave: () => { ok: true }
}

/**
 * Sample data, on the desktop app's own router only (specs/046-everyday-ux, U5): a companion screen
 * or the headless server never builds a sample or restarts the app (EUX-017).
 */
export function registerSampleHandlers(router: ChannelRouter, control: SampleControl): void {
  router.handle('sample:status', validated('sample:status', () => control.status()))
  router.handle('sample:start', validated('sample:start', () => control.start()))
  router.handle('sample:leave', validated('sample:leave', () => control.leave()))
}
