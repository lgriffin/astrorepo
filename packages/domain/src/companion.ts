/**
 * Companion screens (specs/035-pi-variant, companion slice): a Raspberry Pi, or any browser, paired
 * with the Windows app as a second screen. The rules here are pure; the pairing use case and the
 * desktop app's LAN host apply them.
 */

/** What a companion shows: whatever page the PC is on, or one place of its own. */
export const COMPANION_SCREENS = ['follow', 'home', 'sky', 'jobs', 'images', 'messier'] as const
export type CompanionScreen = (typeof COMPANION_SCREENS)[number]
/** The places a companion can stay on, by their id in the app's map of places. */
export type CompanionPlace = Exclude<CompanionScreen, 'follow'>

export const isCompanionScreen = (value: unknown): value is CompanionScreen =>
  typeof value === 'string' && (COMPANION_SCREENS as readonly string[]).includes(value)

/** A pairing code has six digits, shown on the companion and typed on the PC. */
export const PAIRING_CODE_DIGITS = 6
/** How long a code shown on a companion can be typed on the PC. */
export const PAIRING_LIFETIME_MS = 5 * 60_000
/** Screens that may wait for a code to be typed at once; more are refused until one finishes. */
export const MAX_WAITING_PAIRINGS = 5
/** Companions a PC keeps paired at once. */
export const MAX_COMPANIONS = 8
/** A companion's last-seen time is written at most this often, though it calls every few seconds. */
export const LAST_SEEN_STEP_MS = 60_000
/** The longest companion name. */
export const MAX_COMPANION_NAME = 40

/** The code a person typed, as six digits with spaces and dashes left out, or null when it is not one. */
export function readPairingCode(typed: string): string | null {
  const digits = typed.replace(/[\s-]/g, '')
  return new RegExp(`^\\d{${PAIRING_CODE_DIGITS}}$`).test(digits) ? digits : null
}

/** A code as shown on the companion: two groups of three, easier to read across a room. */
export function formatPairingCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`
}

/** Why a companion's name cannot be used, or null when it can. */
export function companionNameProblem(name: string): string | null {
  const trimmed = name.trim()
  if (trimmed.length === 0) return 'Give the screen a name, such as "Pi by the scope".'
  if (trimmed.length > MAX_COMPANION_NAME) return `A screen's name has at most ${MAX_COMPANION_NAME} characters.`
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return "A screen's name cannot hold control characters."
  return null
}

/** Whether a waiting pairing can no longer be finished. */
export const pairingExpired = (expiresAt: Date, now: Date): boolean => now.getTime() >= expiresAt.getTime()

/** Whether a companion's last-seen time is old enough to write again. */
export const shouldMarkSeen = (lastSeenAt: Date | null, now: Date): boolean =>
  lastSeenAt === null || now.getTime() - lastSeenAt.getTime() >= LAST_SEEN_STEP_MS

/**
 * The PC's page as a companion may follow it: an app path, never Settings (where companions are
 * paired and removed), or null when it is not one.
 */
export function shareablePcRoute(route: string): string | null {
  if (!route.startsWith('/') || route.startsWith('//') || route.length > 300) return null
  const path = route.split(/[?#]/)[0]
  if (path === '/settings' || path.startsWith('/settings/')) return null
  return route
}

/**
 * Whether a paired companion may call a channel. It can do what someone at the PC can, except pair,
 * remove or reconfigure companions (through their own channels or the settings they keep) and wipe
 * the library.
 */
export function companionMayCall(channel: string, args: readonly unknown[]): boolean {
  if (channel.startsWith('companion:') || channel === 'db:reset') return false
  if (channel === 'settings:set' || channel === 'settings:get') {
    const key = (args[0] as { key?: unknown } | null | undefined)?.key
    if (typeof key === 'string' && key.startsWith('companion_')) return false
  }
  return true
}
