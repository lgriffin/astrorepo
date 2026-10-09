import type { SirilRunEstimate, StackAdvice } from '@astro/application'
import type { FilterPlanView, SirilPlanView, StackAdviceView } from '@shared/types'
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
      // Mono lights of several filters are stacked one filter at a time, never mixed (RIG-006).
      canQueue: e.counts.lights > 0 && e.freeBytes !== null && s.missing.length === 0 && s.fits && !e.filters,
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
    advice: toAdviceView(e.advice),
    rawNote: rawNote(e.cameraRaw ?? null),
    filters: e.filters ? toFilterPlanView(e.filters, e.freeBytes) : null
  }
}

/** What the plan says about camera RAW lights (RIG-004); null when there are none. */
export function rawNote(raw: SirilRunEstimate['cameraRaw']): string | null {
  if (!raw) return null
  const unread =
    raw.unread > 0
      ? ` ${plural(raw.unread, 'light')} ${raw.unread === 1 ? 'is' : 'are'} not indexed (CR3 and RAF metadata is not read), so ${raw.unread === 1 ? 'its' : 'their'} settings and size are unknown.`
      : ''
  return `${plural(raw.count, 'light')} ${raw.count === 1 ? 'is' : 'are'} camera RAW (${LIST(raw.formats)}). Siril's colour scripts read RAW in their convert step and debayer it, so the colour script above stacks them as they are.${unread}`
}

/** One stack per filter for mono lights (RIG-006 to RIG-008). */
export function toFilterPlanView(f: NonNullable<SirilRunEstimate['filters']>, freeBytes: number | null): FilterPlanView {
  const notes: string[] = []
  if (f.unfilteredLights > 0) notes.push(`${plural(f.unfilteredLights, 'light')} ${f.unfilteredLights === 1 ? 'records' : 'record'} no filter, so no filter's stack takes ${f.unfilteredLights === 1 ? 'it' : 'them'}.`)
  if (f.unfilteredFlats > 0) notes.push(`${plural(f.unfilteredFlats, 'flat')} ${f.unfilteredFlats === 1 ? 'records' : 'record'} no filter, so no filter's stack takes ${f.unfilteredFlats === 1 ? 'it' : 'them'}.`)
  if (f.flatsMissing.length > 0) notes.push(`No flats taken with ${LIST(f.flatsMissing)}: Siril's mono script needs flats from the same filter, because dust and vignetting change with it.`)
  const done = f.stacks.filter(s => s.master !== null).length
  return {
    intro: `These mono lights carry ${f.stacks.length} filters. Siril's mono script stacks one filter at a time, so each filter is laid out in its own work folder with its own flats and the shared ${plural(f.darks, 'dark')} and ${plural(f.biases, 'bias', 'biases')}.`,
    notes,
    stacks: f.stacks.map(s => {
      const c = s.counts
      const script = s.script
      return {
        filter: s.filter,
        workDir: s.workDir,
        frames: [plural(c.lights, 'light'), plural(c.flats, 'flat'), plural(c.darks, 'dark'), plural(c.biases, 'bias', 'biases')].join(', ') +
          (s.rejectedLights > 0 ? `; ${plural(s.rejectedLights, 'light')} rejected by grading left out` : ''),
        needed: script ? formatBytes(script.neededBytes) : null,
        verdict: !script || freeBytes === null ? 'unknown' : script.fits ? 'fits' : 'short',
        verdictText: !script || freeBytes === null ? 'Free space unknown' : script.fits ? `Fits, ${formatBytes(script.headroomBytes ?? 0)} to spare` : `Short by ${formatBytes(script.shortBytes ?? 0)}`,
        missing: script && script.missing.length > 0 ? `Needs ${LIST(script.missing)} for this filter, which this folder does not have.` : null,
        canQueue: !!script && c.lights > 0 && freeBytes !== null && script.missing.length === 0 && script.fits,
        master: s.master ? s.master.path.split(/[\\/]/).pop() ?? s.master.path : null
      }
    }),
    mastersNote:
      done === 0
        ? 'Each finished stack leaves its channel master in its filter\'s work folder, listed here.'
        : done < f.stacks.length
          ? `${done} of ${f.stacks.length} channels ${done === 1 ? "has" : "have"} a master. Stack the rest, then combine them in Siril's RGB composition.`
          : "Every channel has a master. Combine them in Siril's RGB composition."
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
