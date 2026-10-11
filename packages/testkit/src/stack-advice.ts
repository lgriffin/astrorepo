import type { ScriptEstimate, SirilRunEstimate, StackAdvice } from '@astro/application'
import { spaceState, stackRefusal } from '@astro/domain'

/** Advice with nothing to say, varied by the overrides, for estimates built by hand in tests. */
export function stackAdvice(over: Partial<StackAdvice> = {}): StackAdvice {
  return {
    scaleArcsec: null,
    drizzle: { suggest: false, reason: 'The lights do not record focal length and pixel size, so the image scale is unknown.', extraBytes: null },
    rejection: { method: 'Winsorized sigma clipping', siril: 'rej w 3 3', reason: 'From ten lights.' },
    calibration: [],
    nights: null,
    ...over
  }
}

type HandBuiltScript = Omit<ScriptEstimate, 'space' | 'refusal'> & Partial<Pick<ScriptEstimate, 'space' | 'refusal'>>

/**
 * A script estimate built by hand, given the space state and refusal the use case would work out
 * from it with the domain's rules (spaceState, stackRefusal), so fixtures never disagree with them.
 */
export function scriptEstimate(s: HandBuiltScript, context: { lights?: number; freeBytes?: number | null; mixesFilters?: boolean } = {}): ScriptEstimate {
  const verdict = context.freeBytes === null ? { ...s, fits: true, headroomBytes: null, shortBytes: null } : s
  return {
    ...verdict,
    space: spaceState(verdict),
    refusal: stackRefusal({ lights: context.lights ?? 1, missing: s.missing, verdict, mixesFilters: context.mixesFilters ?? false })
  }
}

/** A whole estimate built by hand, with each script's space state and refusal derived as the use case does. */
export function sirilEstimate(e: Omit<SirilRunEstimate, 'scripts'> & { scripts: HandBuiltScript[] }): SirilRunEstimate {
  const context = { lights: e.counts.lights, freeBytes: e.freeBytes, mixesFilters: !!e.filters }
  return { ...e, scripts: e.scripts.map(s => scriptEstimate(s, context)) }
}
