import { CompanionRefusedError, type Companion } from '@astro/application'
import type { CompanionHost } from '../http/companion-host'
import type { ChannelRouter } from '../transport/router'
import { validated } from './handlers'

/** What the companion channels need: the host serving companions and the pairing use case. */
export interface CompanionControl {
  host: CompanionHost
  companion: () => Companion
}

/** A refusal the person can act on comes back as a message; anything else is a bug and throws. */
async function refusable<T>(work: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await work() }
  } catch (error) {
    if (error instanceof CompanionRefusedError) return { ok: false, error: error.message }
    throw error
  }
}

/**
 * Settings → Companion screens, on the desktop app's own router only (specs/035-pi-variant): turning
 * the companion host on, pairing by code, removing, choosing what each screen shows, and the page
 * the PC is on for companions that follow it.
 */
export function registerCompanionHandlers(router: ChannelRouter, control: CompanionControl): void {
  router.handle('companion:status', validated('companion:status', () => control.host.status()))
  router.handle('companion:set-enabled', validated('companion:set-enabled', args => control.host.setEnabled(args.enabled, args.port)))
  router.handle('companion:approve', validated('companion:approve', args => refusable(() => control.companion().approvePairing(args.code))))
  router.handle('companion:list', validated('companion:list', () => control.companion().listCompanions()))
  router.handle('companion:remove', validated('companion:remove', args => refusable(() => control.companion().removeCompanion(args.id))))
  router.handle('companion:set-screen', validated('companion:set-screen', args => refusable(() => control.companion().setScreen(args.id, args.screen))))
  router.handle('companion:report-route', validated('companion:report-route', args => {
    control.companion().reportPcRoute(args.route)
    return null
  }))
}
