import type { CometPlan } from '@astro/application'
import type { CometOrbit } from '@astro/domain'
import type { CometPlanView } from '@shared/types'
import { plural } from './stacking-suggestion-presenter'

const pad = (n: number, width = 2) => String(n).padStart(width, '0')

/** Right ascension as "10h 34m 14.2s". */
export function formatRa(deg: number): string {
  const tenths = Math.round((((deg % 360) + 360) % 360) / 15 * 36000)
  const h = Math.floor(tenths / 36000) % 24
  const m = Math.floor((tenths % 36000) / 600)
  const s = (tenths % 600) / 10
  return `${pad(h)}h ${pad(m)}m ${s.toFixed(1).padStart(4, '0')}s`
}

/** Declination as "+19° 09′ 31″". */
export function formatDec(deg: number): string {
  const total = Math.round(Math.abs(deg) * 3600)
  const d = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  return `${deg < 0 ? '−' : '+'}${pad(d)}° ${pad(m)}′ ${pad(total % 60)}″`
}

/** The elements in one line, as the MPC gives them. */
export function orbitText(o: CometOrbit): string {
  const day = (o.perihelionAt.getTime() - Date.UTC(o.perihelionAt.getUTCFullYear(), o.perihelionAt.getUTCMonth(), 1)) / 86_400_000 + 1
  const kind = o.e < 1 ? 'elliptic' : o.e === 1 ? 'parabolic' : 'hyperbolic'
  return (
    `Perihelion ${o.perihelionAt.getUTCFullYear()}-${pad(o.perihelionAt.getUTCMonth() + 1)}-${day.toFixed(4).padStart(7, '0')} TT at q ${o.q} AU, ` +
    `e ${o.e} (${kind}), i ${o.inclinationDeg}°, node ${o.nodeDeg}°, argument of perihelion ${o.periDeg}°` +
    (o.epoch ? `; elements for ${o.epoch}.` : '.')
  )
}

/** Positions shown for checking: the first three, the last three, never more. */
const SHOWN = 3

/** A comet's plan for the target page (RIG-013 to RIG-016). */
export function toCometPlanView(plan: CometPlan): CometPlanView {
  if (plan.status === 'not-comet') {
    return { show: false, orbit: null, count: 0, positions: [], undatedNote: null, motion: null, observerNote: null, step: null, file: null, canWrite: false, writtenNote: null }
  }
  const rows = plan.positions.length <= SHOWN * 2 ? plan.positions : [...plan.positions.slice(0, SHOWN), ...plan.positions.slice(-SHOWN)]
  const m = plan.motion
  const fileName = plan.file?.split(/[\\/]/).pop() ?? null
  return {
    show: true,
    orbit: plan.orbit ? { name: plan.orbit.name, text: orbitText(plan.orbit) } : null,
    count: plan.positions.length,
    positions: rows.map(p => ({ frame: p.frame, time: p.at.toISOString().replace('T', ' ').slice(0, 19), ra: formatRa(p.raDeg), dec: formatDec(p.decDeg) })),
    undatedNote:
      plan.undated > 0
        ? `${plural(plan.undated, 'light')} ${plan.undated === 1 ? 'records' : 'record'} no capture time, so ${plan.undated === 1 ? 'it has' : 'they have'} no position and ${plan.undated === 1 ? 'is' : 'are'} left out of the positions file.`
        : null,
    motion: m
      ? `The comet moves ${m.arcsecPerHour.toFixed(1)}″ an hour towards position angle ${Math.round(m.positionAngleDeg)}° (north through east): ${m.arcsec.toFixed(0)}″ over the ${m.spanHours.toFixed(1)} h of lights.`
      : null,
    observerNote: plan.orbit
      ? plan.fromSite
        ? 'Positions are astrometric J2000, at mid-exposure, as seen from your site.'
        : "Positions are astrometric J2000, at mid-exposure, as seen from the Earth's centre. Set your site in Settings to see them from where you stand, which matters for a comet close to the Earth."
      : null,
    step:
      plan.positions.length > 1 && fileName
        ? `Stack on the comet: after the stack on the stars, register the sequence with Siril's comet registration, using the motion above. ${fileName} in the work folder gives the comet's position in every light, so you can check the two frames you pick.`
        : null,
    file: plan.file,
    canWrite: plan.positions.length > 0 && plan.file !== null,
    writtenNote: plan.written && fileName ? `Wrote ${fileName} with ${plural(plan.positions.length, 'position')} to the work folder.` : null
  }
}
