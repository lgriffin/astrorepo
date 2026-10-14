/**
 * A Vaonis Vespera's connection settings and the pace of a copy from it (spec 033). The scope
 * serves its storage over anonymous FTP at 10.0.0.1 on its own Wi-Fi; these rules read where to
 * find it, where copies land and which kinds of file to copy from what is saved. The copy itself
 * (scan, review and transfer) is spec 034's, in vespera-ingest.ts. Pure rules: no I/O.
 */

export const VESPERA_DEFAULT_HOST = '10.0.0.1'
export const VESPERA_DEFAULT_PORT = 21

export type VesperaFormat = 'fits' | 'tiff' | 'jpeg' | 'json'
export const VESPERA_FORMATS: readonly VesperaFormat[] = ['fits', 'tiff', 'jpeg', 'json']
/**
 * Raw frames and the scope's own TIFF stacks; JPEG previews and the JSON metadata are left on the
 * scope unless asked for.
 */
export const DEFAULT_VESPERA_FORMATS: readonly VesperaFormat[] = ['fits', 'tiff']

export interface VesperaSettings {
  host: string
  port: number
  /** Where copies land; null when neither the setting nor the home folder says. */
  landingRoot: string | null
  /** The landing folder is the home folder's raw folder, as no folder of its own is set. */
  landingIsHomeRaw: boolean
  formats: VesperaFormat[]
  /** Saved settings that could not be read and so were replaced by their default. */
  ignored: ('vespera_host' | 'vespera_formats')[]
}

const HOSTNAME = /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

/** Whether text is an address the app may connect to: an IPv4 address or a host name. */
export function isScopeHost(text: string): boolean {
  const ip = IPV4.exec(text)
  if (ip) return ip.slice(1).every(n => Number(n) <= 255)
  return !/^[\d.]+$/.test(text) && HOSTNAME.test(text)
}

/**
 * The Vespera settings from what is saved: `vespera_host` (an address, port after a colon),
 * `vespera_landing` and `vespera_formats` (comma separated). Anything unreadable falls back to its
 * default: 10.0.0.1 on port 21, FITS and TIFF, and the home folder's `raw` folder to land in.
 */
export function parseVesperaSettings(saved: Record<string, string | null | undefined>, homeRaw: string | null): VesperaSettings {
  let host = VESPERA_DEFAULT_HOST
  let port = VESPERA_DEFAULT_PORT
  const address = (saved.vespera_host ?? '').trim()
  const m = /^([^:\s]+)(?::(\d{1,5}))?$/.exec(address)
  if (m && isScopeHost(m[1])) {
    const p = m[2] === undefined ? VESPERA_DEFAULT_PORT : Number(m[2])
    if (p >= 1 && p <= 65535) {
      host = m[1]
      port = p
    }
  }
  const ignored: VesperaSettings['ignored'] = []
  if (address !== '' && host === VESPERA_DEFAULT_HOST && port === VESPERA_DEFAULT_PORT && address !== VESPERA_DEFAULT_HOST && address !== `${VESPERA_DEFAULT_HOST}:${VESPERA_DEFAULT_PORT}`) {
    ignored.push('vespera_host')
  }
  const savedFormats = (saved.vespera_formats ?? '').trim()
  const wanted = new Set(savedFormats.split(',').map(f => f.trim().toLowerCase()))
  const picked = VESPERA_FORMATS.filter(f => wanted.has(f))
  // Metadata alone is not a copy worth making, so at least one kind of image is always copied.
  const formats = picked.some(f => f !== 'json') ? picked : [...DEFAULT_VESPERA_FORMATS]
  if (savedFormats !== '' && formats !== picked) ignored.push('vespera_formats')
  const landing = (saved.vespera_landing ?? '').trim()
  return { host, port, landingRoot: landing || homeRaw || null, landingIsHomeRaw: !landing && !!homeRaw, formats, ignored }
}

/** How far a copy has got and how long the rest should take at the speed so far. */
export interface CopyPace {
  /** 0 to 1. */
  fraction: number
  bytesPerSecond: number | null
  remainingSeconds: number | null
}

/** The pace of a copy from the bytes done, the bytes in all and the milliseconds it has run. */
export function copyPace(doneBytes: number, totalBytes: number, elapsedMs: number): CopyPace {
  const done = Math.max(0, doneBytes)
  const total = Math.max(0, totalBytes)
  const fraction = total === 0 ? 1 : Math.min(1, done / total)
  if (!(elapsedMs >= 1000) || done === 0) return { fraction, bytesPerSecond: null, remainingSeconds: null }
  const bytesPerSecond = (done * 1000) / elapsedMs
  return { fraction, bytesPerSecond, remainingSeconds: Math.max(0, Math.ceil((total - done) / bytesPerSecond)) }
}

