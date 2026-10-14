import type { CopyProgress, VesperaSurvey } from '@astro/application'
import { VESPERA_DEFAULT_PORT, type ObservationStatus, type VesperaFormat, type VesperaSettings } from '@astro/domain'
import type { VesperaObservationView, VesperaProgressView, VesperaSettingsView, VesperaSurveyView } from '@shared/types'
import { formatBytes } from './discovery-presenter'
import { formatDuration } from './job-presenter'

const FORMAT_LABEL: Record<VesperaFormat, string> = { fits: 'FITS', tiff: 'TIFF', jpeg: 'JPEG', json: 'JSON' }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

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

/** "10 Mar 2024, 21:33" from the scope's local `2024-03-10T21:33[:02]`, or the date alone. */
export function formatTakenAt(takenAt: string | null): string | null {
  if (!takenAt) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(takenAt)
  if (!m) return null
  const date = `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`
  return m[4] === undefined ? date : `${date}, ${m[4]}:${m[5]}`
}

function contents(o: ObservationStatus): string {
  const parts = (['fits', 'tiff', 'jpeg'] as const).filter(f => o.counts[f] > 0).map(f => `${o.counts[f]} ${FORMAT_LABEL[f]}`)
  return parts.length > 0 ? parts.join(', ') : 'No images'
}

export function toObservationView(o: ObservationStatus): VesperaObservationView {
  const state = o.state
  const stateLine =
    state === 'empty'
      ? 'Nothing of the kinds you copy'
      : state === 'copied'
        ? o.differentFiles > 0 ? `${plural(o.copiedFiles, 'file')} on the PC` : `All ${plural(o.files, 'file')} are on the PC`
        : state === 'new'
          ? `${plural(o.newFiles, 'file')} to copy, ${formatBytes(o.newBytes)}`
          : `${o.newFiles} of ${plural(o.files, 'file')} still to copy, ${formatBytes(o.newBytes)}`
  return {
    kind: o.kind,
    folder: o.folder,
    title: o.target ?? o.folder,
    takenAt: formatTakenAt(o.takenAt),
    suggestedTarget: o.landsIn,
    contents: contents(o),
    state,
    stateLine,
    warning:
      o.differentFiles > 0
        ? `${plural(o.differentFiles, 'file')} on the PC ${o.differentFiles === 1 ? 'has' : 'have'} the same name but another size, so ${o.differentFiles === 1 ? 'it is' : 'they are'} left alone.`
        : null
  }
}

export function toVesperaSurveyView(s: VesperaSurvey): VesperaSurveyView {
  const observations = s.observations.map(toObservationView)
  const count = s.observations.filter(o => o.kind === 'observation').length
  const summary =
    s.newFiles === 0
      ? `${plural(count, 'observation')} on the scope, and everything is on the PC.`
      : `${plural(count, 'observation')} on the scope, ${plural(s.newFiles, 'new file')} (${formatBytes(s.newBytes)}) to copy.`
  let spaceLine: string | null = null
  let spaceShort = false
  if (s.space) {
    if (s.space.shortBytes !== null) {
      spaceLine = `Copying everything needs ${formatBytes(s.space.shortBytes)} more room where copies land.`
      spaceShort = true
    } else if (s.space.headroomBytes !== null) spaceLine = `${formatBytes(s.space.headroomBytes)} would be left free where copies land.`
  }
  return { ok: true, address: vesperaAddress(s), landingRoot: s.landingRoot, observations, summary, spaceLine, spaceShort }
}

export function toVesperaProgressView(p: CopyProgress, indexing: string | null): VesperaProgressView {
  const running = p.state === 'connecting' || p.state === 'copying'
  const files = plural(p.totalFiles, 'file')
  const headline = {
    idle: 'No copy has run yet.',
    connecting: 'Connecting to the Vespera…',
    copying: `Copying ${Math.min(p.doneFiles + 1, p.totalFiles)} of ${files}`,
    done: p.totalFiles === 0 ? 'Nothing new to copy: every file is already on the PC.' : `Copied ${files}${p.landingRoot ? ` to ${p.landingRoot}` : ''}.`,
    failed: `The copy stopped after ${plural(p.doneFiles, 'file')}.`,
    cancelled: `Cancelled after ${plural(p.doneFiles, 'file')}. Copy again carries on from there.`
  }[p.state]
  let detail: string | null = null
  if (p.state === 'copying' && p.totalBytes > 0) {
    const pace = p.pace.bytesPerSecond ? `, ${formatBytes(p.pace.bytesPerSecond)}/s` : ''
    const left = p.pace.remainingSeconds !== null ? `, about ${formatDuration(p.pace.remainingSeconds)} left` : ''
    detail = `${formatBytes(p.doneBytes)} of ${formatBytes(p.totalBytes)}${pace}${left}`
  } else if (p.skippedFiles > 0 && !running && p.state !== 'idle') {
    detail = `${plural(p.skippedFiles, 'file')} already on the PC ${p.skippedFiles === 1 ? 'was' : 'were'} skipped.`
  }
  let error: string | null = null
  if (p.state === 'failed') {
    error = p.shortBytes !== null
      ? `Nothing was copied: the folder copies land in needs ${formatBytes(p.shortBytes)} more room.`
      : `${p.error ?? 'The copy failed.'} Files already copied are kept; Copy again carries on from the next one.`
  }
  return { state: p.state, running, headline, detail, fraction: p.pace.fraction, current: p.current, error, indexing }
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
    if (i.status === 'done') return 'The home folder was scanned: the copies show on their targets and in Next actions.'
    if (i.status === 'error') return `The home folder scan failed: ${i.error ?? 'no reason given'}. Scan again from Library.`
    if (i.status === 'cancelled') return 'The home folder scan was cancelled. Scan again from Library to see the copies.'
    return null
  }
  if (i.error) return `The copies were not scanned: ${i.error}. Scan again from Library.`
  return i.done ? `${i.folder} was scanned: the copies show in FITS files.` : `Scanning ${i.folder} for the copies…`
}
