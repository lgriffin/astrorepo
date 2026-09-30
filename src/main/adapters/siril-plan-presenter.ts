import type { SirilRunEstimate } from '@astro/application'
import type { SirilPlanView } from '@shared/types'
import { formatBytes } from './discovery-presenter'
import { plural } from './stacking-suggestion-presenter'

const LIST = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`)

/** A target's stacking plan as the target page shows it (specs/014-siril-space). */
export function toSirilPlanView(e: SirilRunEstimate): SirilPlanView {
  const c = e.counts
  const frames =
    [plural(c.lights, 'light'), plural(c.darks, 'dark'), plural(c.flats, 'flat'), plural(c.biases, 'bias', 'biases')].join(', ') +
    (e.geometry ? `, ${e.geometry.width} × ${e.geometry.height} ${e.sensor === 'colour' ? 'colour' : 'mono'}` : '')

  const guessed: string[] = []
  if (e.geometryApproximate) guessed.push('frame size is guessed from file size')
  if (!e.sensorKnown && e.counts.lights > 0) guessed.push('the lights are taken as colour')
  const approximateNote =
    guessed.length > 0 ? `Scan this folder in the FITS Analyzer for exact figures: ${LIST(guessed)}, so sizes are approximate.` : null

  return {
    recommended: e.recommended.script ? `${e.recommended.script}.ssf` : null,
    reason: e.recommended.reason,
    frames,
    prepNote:
      e.prepBytes === 0
        ? 'Prep for Siril hard-links the frames, so it takes no extra space.'
        : `Prep for Siril copies ${formatBytes(e.prepBytes)} of frames, because the work area is on another disk.`,
    freeSpace: e.freeBytes === null ? null : `${formatBytes(e.freeBytes)} free on the work area's disk`,
    approximateNote,
    scripts: e.scripts.map(s => ({
      file: `${s.script}.ssf`,
      label: s.label,
      recommended: s.script === e.recommended.script,
      needed: formatBytes(s.netBytes),
      verdict: e.freeBytes === null ? 'unknown' : s.fits ? 'fits' : 'short',
      verdictText:
        e.freeBytes === null
          ? 'Free space unknown'
          : s.fits
            ? `Fits, ${formatBytes(s.headroomBytes ?? 0)} to spare`
            : `Short by ${formatBytes(s.shortBytes ?? 0)}`,
      missing: s.missing.length > 0 ? `Needs ${LIST(s.missing)}, which this target does not have.` : null,
      stages: s.stages.map(st => ({ name: st.name, size: formatBytes(st.bytes), cumulative: formatBytes(st.cumulativeBytes), files: st.files }))
    }))
  }
}
