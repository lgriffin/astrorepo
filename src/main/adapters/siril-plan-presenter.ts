import type { SirilRunEstimate, StackAdvice } from '@astro/application'
import type { SirilPlanView, StackAdviceView } from '@shared/types'
import { nightLabel } from './grades-presenter'
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
  const approximate = [
    guessed.length > 0 ? `Scan this folder on the FITS files page for exact figures: ${LIST(guessed)}, so sizes are approximate.` : null,
    e.geometryMixed ? 'The lights are not all one size, so every light is counted at the largest.' : null
  ].filter(Boolean)

  return {
    recommended: e.recommended.script ? `${e.recommended.script}.ssf` : null,
    reason: e.recommended.reason,
    frames,
    prepNote:
      e.prepBytes === 0
        ? 'Prep for Siril copies nothing: the frames are hard-linked or already in the work area.'
        : `Prep for Siril copies ${formatBytes(e.prepBytes)} of frames, because they are on another disk from the work area.`,
    freeSpace: e.freeBytes === null ? null : `${formatBytes(e.freeBytes)} free on the work area's disk`,
    approximateNote: approximate.length > 0 ? approximate.join(' ') : null,
    leftoverNote:
      e.usedBytes > 0
        ? `An earlier run left ${formatBytes(e.usedBytes)} in the work folder's process and masters. It is not counted as free; delete it before running to get the space back.`
        : null,
    gradingNote:
      e.rejectedLights > 0
        ? `${plural(e.rejectedLights, 'light')} rejected by frame grading ${e.rejectedLights === 1 ? 'is' : 'are'} left out of the stack and the space.`
        : null,
    scripts: e.scripts.map(s => ({
      file: `${s.script}.ssf`,
      script: s.script,
      canQueue: e.counts.lights > 0 && e.freeBytes !== null && s.missing.length === 0 && s.fits,
      label: s.label,
      recommended: s.script === e.recommended.script,
      needed: formatBytes(s.neededBytes),
      verdict: e.freeBytes === null ? 'unknown' : s.fits ? 'fits' : 'short',
      verdictText:
        e.freeBytes === null
          ? 'Free space unknown'
          : s.fits
            ? `Fits, ${formatBytes(s.headroomBytes ?? 0)} to spare`
            : `Short by ${formatBytes(s.shortBytes ?? 0)}`,
      missing: s.missing.length > 0 ? `Needs ${LIST(s.missing)}, which this target does not have.` : null,
      stages: s.stages.map(st => ({ name: st.name, size: formatBytes(st.bytes), cumulative: formatBytes(st.cumulativeBytes), files: st.files })),
      memory: s.memory ? { fit: s.memory.fit, text: s.memory.text } : null
    })),
    advice: toAdviceView(e.advice)
  }
}

/** Image scale, drizzle, rejection, calibration and nights, as sentences (specs/020-stacking-advice). */
export function toAdviceView(a: StackAdvice): StackAdviceView {
  const extra = a.drizzle.extraBytes !== null && a.drizzle.extraBytes > 0 ? ` It needs ${formatBytes(a.drizzle.extraBytes)} more disk than the recommended script.` : ''
  return {
    scale: a.scaleArcsec === null ? null : `${a.scaleArcsec.toFixed(2)}"/px`,
    drizzle: { suggest: a.drizzle.suggest, text: a.drizzle.reason + (a.drizzle.suggest ? extra : '') },
    rejection: { method: a.rejection.method, siril: a.rejection.siril, text: a.rejection.reason },
    calibration: a.calibration.map(c => ({ kind: c.kind, status: c.status, text: c.text })),
    nights: a.nights
      ? a.nights.nights.map(n => ({
          night: n.night,
          label: nightLabel(n.night),
          lights: n.lights,
          kept: n.kept,
          rejected: n.rejected,
          medianFwhm: n.medianFwhm === null ? null : `${n.medianFwhm.toFixed(1)} px`,
          flats: n.flats,
          leftOut: n.leftOut
        }))
      : null,
    sharedFlatsNote: a.nights?.sharedFlatsNote ?? null
  }
}
