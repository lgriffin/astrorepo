import type { Fetch } from './bridge'

/** After a touch, a following companion stays where the person put it this long (PI-021). */
export const TOUCH_HOLD_MS = 60_000
/** How often a companion asks the PC where to be. */
export const FOLLOW_EVERY_MS = 3_000
/** How often a waiting companion asks whether its code was typed. */
export const PAIR_CHECK_EVERY_MS = 2_000

/**
 * Whether a companion moves to the page the PC wants: only to a different page, and not within a
 * minute of someone touching it (PI-021).
 */
export function shouldMove(input: { current: string; wanted: string | null; lastTouchAt: number | null; now: number }): boolean {
  if (input.wanted === null || input.wanted === input.current) return false
  return input.lastTouchAt === null || input.now - input.lastTouchAt >= TOUCH_HOLD_MS
}

export interface PairingStarted {
  requestId: string
  code: string
  expiresAt: string
}

export type PairingStatus = { state: 'waiting'; expiresAt: string } | { state: 'paired'; key: string; name: string } | { state: 'expired' }

/** The PC no longer knows this screen's key: it must pair again. */
export class NotPairedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotPairedError'
  }
}

async function post<T>(fetchFn: Fetch, url: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
  const answer = (await res.json().catch(() => null)) as { value?: T; error?: string; pair?: unknown } | null
  if (res.status === 401 && answer?.pair === true) throw new NotPairedError(answer.error ?? 'This screen is not paired with the PC.')
  if (!res.ok) throw new Error(answer?.error ?? `The PC did not answer (HTTP ${res.status}).`)
  return answer?.value as T
}

/** Asks the PC for a pairing code to show (PI-018). */
export const startPairing = (fetchFn: Fetch, name: string) => post<PairingStarted>(fetchFn, '/api/companion/pair', { name })

/** Whether the code shown was typed on the PC yet; the key comes back once (PI-018). */
export const checkPairing = (fetchFn: Fetch, requestId: string) => post<PairingStatus>(fetchFn, '/api/companion/pair-status', { requestId })

/** Where the PC wants this companion to be (PI-021). */
export const askScreen = (fetchFn: Fetch, key: string) =>
  post<{ screen: string; route: string }>(fetchFn, '/api/companion/screen', {}, { 'X-Astrorepo-Device': key })
