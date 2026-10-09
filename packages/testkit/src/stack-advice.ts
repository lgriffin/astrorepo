import type { StackAdvice } from '@astro/application'

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
