import {
  companionNameProblem,
  isCompanionScreen,
  MAX_COMPANIONS,
  MAX_WAITING_PAIRINGS,
  PAIRING_LIFETIME_MS,
  pairingExpired,
  readPairingCode,
  shareablePcRoute,
  shouldMarkSeen,
  type CompanionPlace,
  type CompanionScreen
} from '@astro/domain'
import type { Clock } from '../ports/clock'
import type { CompanionDeviceStore, CompanionSecrets } from '../ports/companion'

/** A request a person can fix: the message says what to do. */
export class CompanionRefusedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CompanionRefusedError'
  }
}

export interface CompanionDeps {
  devices: CompanionDeviceStore
  secrets: CompanionSecrets
  clock: Clock
  /** The app path of each place a companion can stay on. */
  places: Record<CompanionPlace, string>
}

/** What a companion is shown while it waits for its code to be typed on the PC. */
export interface PairingStarted {
  requestId: string
  code: string
  expiresAt: Date
}

/** Where a waiting pairing stands; the key is handed over once, on the first ask after approval. */
export type PairingStatus = { state: 'waiting'; expiresAt: Date } | { state: 'paired'; key: string; name: string } | { state: 'expired' }

/** A paired companion as the PC's settings list it. */
export interface CompanionView {
  id: string
  name: string
  screen: CompanionScreen
  pairedAt: Date
  lastSeenAt: Date | null
}

/** Where a companion should be: its screen choice and the app path that means now. */
export interface CompanionScreenView {
  screen: CompanionScreen
  route: string
}

interface Waiting {
  code: string
  name: string
  expiresAt: Date
  key: string | null
}

export interface Companion {
  /** A companion asks to pair; it shows the code, which a person types on the PC. */
  requestPairing(name: string): Promise<PairingStarted>
  pairingStatus(requestId: string): Promise<PairingStatus>
  /** On the PC: the code a person read off the companion. */
  approvePairing(typedCode: string): Promise<CompanionView>
  /** The companion a key belongs to, or null when the key is not (or no longer) paired. */
  authenticate(key: string): Promise<CompanionView | null>
  listCompanions(): Promise<CompanionView[]>
  removeCompanion(id: string): Promise<void>
  setScreen(id: string, screen: string): Promise<void>
  /** The desktop app says which page it is on, for companions that follow it. */
  reportPcRoute(route: string): void
  screenFor(id: string): Promise<CompanionScreenView>
}

const view = ({ id, name, screen, pairedAt, lastSeenAt }: CompanionView): CompanionView => ({ id, name, screen, pairedAt, lastSeenAt })

/** Pairing, removing and steering companion screens (specs/035-pi-variant, PI-017 to PI-023). */
export function makeCompanion(deps: CompanionDeps): Companion {
  const waiting = new Map<string, Waiting>()
  let pcRoute: string | null = null

  const now = () => deps.clock.now()
  const prune = () => {
    for (const [id, w] of waiting) if (pairingExpired(w.expiresAt, now())) waiting.delete(id)
  }

  return {
    async requestPairing(name) {
      const problem = companionNameProblem(name)
      if (problem) throw new CompanionRefusedError(problem)
      prune()
      if ([...waiting.values()].filter(w => w.key === null).length >= MAX_WAITING_PAIRINGS) {
        throw new CompanionRefusedError('Too many screens are waiting to pair. Try again in a few minutes.')
      }
      const taken = new Set([...waiting.values()].map(w => w.code))
      let code = deps.secrets.newCode()
      while (taken.has(code)) code = deps.secrets.newCode()
      const requestId = deps.secrets.newSecret()
      const expiresAt = new Date(now().getTime() + PAIRING_LIFETIME_MS)
      waiting.set(requestId, { code, name: name.trim(), expiresAt, key: null })
      return { requestId, code, expiresAt }
    },

    async pairingStatus(requestId) {
      prune()
      const w = waiting.get(requestId)
      if (!w) return { state: 'expired' }
      if (w.key === null) return { state: 'waiting', expiresAt: w.expiresAt }
      waiting.delete(requestId)
      return { state: 'paired', key: w.key, name: w.name }
    },

    async approvePairing(typedCode) {
      const code = readPairingCode(typedCode)
      if (code === null) throw new CompanionRefusedError('A pairing code has six digits, as the screen shows it.')
      prune()
      const entry = [...waiting.values()].find(w => w.code === code && w.key === null)
      if (!entry) throw new CompanionRefusedError('No screen is showing that code. Check it, or have the screen show a new one.')
      if ((await deps.devices.listCompanions()).length >= MAX_COMPANIONS) {
        throw new CompanionRefusedError(`This PC already has ${MAX_COMPANIONS} screens paired. Remove one first.`)
      }
      const key = deps.secrets.newSecret()
      const device = { id: deps.secrets.newSecret(), name: entry.name, keyHash: deps.secrets.hashKey(key), screen: 'follow' as const, pairedAt: now(), lastSeenAt: null }
      await deps.devices.addCompanion(device)
      entry.key = key
      return view(device)
    },

    async authenticate(key) {
      if (key.length === 0) return null
      const device = await deps.devices.companionByKeyHash(deps.secrets.hashKey(key))
      if (!device) return null
      const at = now()
      if (shouldMarkSeen(device.lastSeenAt, at)) {
        await deps.devices.markCompanionSeen(device.id, at)
        device.lastSeenAt = at
      }
      return view(device)
    },

    async listCompanions() {
      return (await deps.devices.listCompanions()).map(view)
    },

    async removeCompanion(id) {
      if (!(await deps.devices.removeCompanion(id))) throw new CompanionRefusedError('That screen is no longer paired.')
    },

    async setScreen(id, screen) {
      if (!isCompanionScreen(screen)) throw new CompanionRefusedError(`A screen shows one of: follow, home, sky, jobs, images, messier, not "${screen}".`)
      if (!(await deps.devices.setCompanionScreen(id, screen))) throw new CompanionRefusedError('That screen is no longer paired.')
    },

    reportPcRoute(route) {
      // While the PC is on a page companions may not show, they stay on the last one they could.
      pcRoute = shareablePcRoute(route) ?? pcRoute
    },

    async screenFor(id) {
      const device = (await deps.devices.listCompanions()).find(d => d.id === id)
      if (!device) throw new CompanionRefusedError('That screen is no longer paired.')
      const route = device.screen === 'follow' ? (pcRoute ?? deps.places.home) : deps.places[device.screen]
      return { screen: device.screen, route }
    }
  }
}
