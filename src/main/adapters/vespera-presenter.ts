import { VESPERA_DEFAULT_PORT, type VesperaFormat, type VesperaSettings } from '@astro/domain'
import type { VesperaSettingsView } from '@shared/types'

const FORMAT_LABEL: Record<VesperaFormat, string> = { fits: 'FITS', tiff: 'TIFF', jpeg: 'JPEG', json: 'JSON' }

export function vesperaAddress(s: { host: string; port: number }): string {
  return s.port === VESPERA_DEFAULT_PORT ? s.host : `${s.host}:${s.port}`
}

export function toVesperaSettingsView(s: VesperaSettings): VesperaSettingsView {
  const notes = s.ignored.map(key =>
    key === 'vespera_host'
      ? `The saved Vespera address is not an address, so ${vesperaAddress(s)} is used.`
      : `The saved kinds of file to copy include no images, so ${s.formats.map(f => FORMAT_LABEL[f]).join(' and ')} are copied.`
  )
  return { address: vesperaAddress(s), landingRoot: s.landingRoot, landingIsDefault: s.landingIsHomeRaw, formats: s.formats, notes }
}

/** What the app is doing to index the copies, for the line under the copy's progress. */
export type IndexingFacts =
  | { kind: 'none' }
  | { kind: 'home-scan'; status: string; error: string | null }
  | { kind: 'folder-scan'; folder: string; done: boolean; error: string | null }

export function indexingText(i: IndexingFacts): string | null {
  if (i.kind === 'none') return null
  if (i.kind === 'home-scan') {
    if (i.status === 'scanning' || i.status === 'cancelling') return 'Scanning the home folder so the copies show on their targets…'
    if (i.status === 'done') return 'The home folder was scanned: the copies show on their targets and on Home.'
    if (i.status === 'error') return `The home folder scan failed: ${i.error ?? 'no reason given'}. Scan again from Library.`
    if (i.status === 'cancelled') return 'The home folder scan was cancelled. Scan again from Library to see the copies.'
    return null
  }
  if (i.error) return `The copies were not scanned: ${i.error}. Scan again from Library.`
  return i.done ? `${i.folder} was scanned: the copies show in FITS files.` : `Scanning ${i.folder} for the copies…`
}
