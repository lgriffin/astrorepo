/**
 * The demo library (specs/045-developer-experience, D4): a small made-up observatory that shows
 * every part of the app with something in it. Six targets at different points of the workflow,
 * spread over a year of nights, laid out as the library expects (raw, stacked, tif, images).
 * Everything here is fixed, so the same library is built every time.
 */

/** Where the demo's scopes stand: the example the site form shows. */
export const DEMO_SITE = { latitude: 53.35, longitude: -6.26 } as const

/** One night on one target: how many subs, through which filter, how long each. */
export interface DemoNight {
  date: string
  subs: number
  filter: string
  exposureSec: number
}

export interface DemoTarget {
  /** The name in FITS OBJECT and picture names, as a catalogue writes it. */
  name: string
  /** The target's folder in each part of the library. */
  folder: string
  nights: DemoNight[]
  stacked: boolean
  tif: boolean
  picture: boolean
}

/** Six targets, one for each place in the workflow the app has something to say about. */
export const DEMO_TARGETS: readonly DemoTarget[] = [
  // Finished: subs over two nights, a master, a TIFF and a picture.
  { name: 'M 31', folder: 'M31', nights: [{ date: '2025-09-20', subs: 40, filter: 'IRCUT', exposureSec: 30 }, { date: '2025-10-12', subs: 60, filter: 'IRCUT', exposureSec: 30 }], stacked: true, tif: true, picture: true },
  // Hours of subs and no stack yet: what Ready to process is for.
  { name: 'M 42', folder: 'M42', nights: [{ date: '2025-12-01', subs: 120, filter: 'LP', exposureSec: 30 }, { date: '2025-12-02', subs: 100, filter: 'LP', exposureSec: 30 }, { date: '2026-01-15', subs: 120, filter: 'LP', exposureSec: 30 }], stacked: false, tif: false, picture: false },
  // Stacked, not yet processed.
  { name: 'M 45', folder: 'M45', nights: [{ date: '2025-11-10', subs: 60, filter: 'IRCUT', exposureSec: 30 }], stacked: true, tif: false, picture: false },
  // Two filters, stacked and exported.
  { name: 'NGC 7000', folder: 'NGC7000', nights: [{ date: '2025-08-02', subs: 40, filter: 'LP', exposureSec: 60 }, { date: '2025-08-03', subs: 40, filter: 'IRCUT', exposureSec: 60 }], stacked: true, tif: true, picture: false },
  // One short night: still capturing.
  { name: 'M 51', folder: 'M51', nights: [{ date: '2026-04-10', subs: 30, filter: 'IRCUT', exposureSec: 30 }], stacked: false, tif: false, picture: false },
  // Finished from one long night.
  { name: 'M 81', folder: 'M81', nights: [{ date: '2026-03-02', subs: 60, filter: 'IRCUT', exposureSec: 30 }], stacked: true, tif: true, picture: true }
]

/** The scope every demo frame was taken with. */
export const DEMO_SCOPE = { telescope: 'Seestar S50', instrument: 'Seestar S50', focalLengthMm: 250, pixelSizeUm: 2.9, gain: 80 } as const

export type DemoFileKind = 'light' | 'master' | 'tif' | 'picture'

/** One file of the demo library: where it goes, what it is, and the header cards of a FITS file. */
export interface DemoFile {
  path: string
  kind: DemoFileKind
  target: string
  cards?: Record<string, string | number>
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Subs start at 21:00 UTC and follow each other with two seconds between, past midnight if need be. */
export function subTime(night: string, index: number, exposureSec: number): Date {
  return new Date(Date.parse(`${night}T21:00:00Z`) + index * (exposureSec + 2) * 1000)
}

const fitsDate = (d: Date) => d.toISOString().slice(0, 19)
const stamp = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`

/** Every file of the library, in a fixed order, with paths relative to the library's root (DEV-015). */
export function demoFiles(targets: readonly DemoTarget[] = DEMO_TARGETS): DemoFile[] {
  const files: DemoFile[] = []
  for (const t of targets) {
    const scope = { TELESCOP: DEMO_SCOPE.telescope, INSTRUME: DEMO_SCOPE.instrument, FOCALLEN: DEMO_SCOPE.focalLengthMm, XPIXSZ: DEMO_SCOPE.pixelSizeUm, YPIXSZ: DEMO_SCOPE.pixelSizeUm, GAIN: DEMO_SCOPE.gain, XBINNING: 1, YBINNING: 1 }
    for (const n of t.nights) {
      for (let i = 0; i < n.subs; i++) {
        const at = subTime(n.date, i, n.exposureSec)
        files.push({
          path: `raw/${t.folder}/${n.date}/Light_${t.name}_${n.exposureSec.toFixed(1)}s_${n.filter}_${stamp(at)}.fit`,
          kind: 'light',
          target: t.name,
          cards: { OBJECT: t.name, IMAGETYP: 'Light', 'DATE-OBS': fitsDate(at), EXPTIME: n.exposureSec, EXPOSURE: n.exposureSec, FILTER: n.filter, 'CCD-TEMP': 18 + (i % 5), ...scope }
        })
      }
    }
    const subs = t.nights.reduce((sum, n) => sum + n.subs, 0)
    const seconds = t.nights.reduce((sum, n) => sum + n.subs * n.exposureSec, 0)
    if (t.stacked) {
      const first = subTime(t.nights[0].date, 0, t.nights[0].exposureSec)
      files.push({
        path: `stacked/${t.folder}/r_pp_Light_${t.folder}_stacked.fit`,
        kind: 'master',
        target: t.name,
        cards: { OBJECT: t.name, IMAGETYP: 'Light', 'DATE-OBS': fitsDate(first), EXPTIME: seconds, LIVETIME: seconds, NCOMBINE: subs, STACKCNT: subs, FILTER: t.nights[0].filter, SOFTWARE: 'Siril', ...scope }
      })
    }
    if (t.tif) files.push({ path: `tif/${t.folder}/${t.folder}_final.tif`, kind: 'tif', target: t.name })
    if (t.picture) files.push({ path: `images/${t.folder}/${t.folder}.png`, kind: 'picture', target: t.name })
  }
  return files
}

/** The file the demo builder leaves in its folder, so it only ever clears a folder it made. */
export const DEMO_MARKER = '.astrorepo-demo'

/**
 * Whether the builder may clear `out` before writing (DEV-015): only a folder that is not there
 * yet, is empty, or holds the builder's marker. Never the checkout, one of its parents or a root.
 */
export function mayClear(out: string, checkout: string, entries: string[] | null): { ok: true } | { ok: false; reason: string } {
  const norm = (p: string) => p.replace(/[\\/]+$/, '') || p
  const o = norm(out)
  const c = norm(checkout)
  const sep = o.includes('\\') ? '\\' : '/'
  if (o === c || c.startsWith(o + sep) || /^([a-z]:)?[\\/]?$/i.test(o)) return { ok: false, reason: `${out} holds the checkout; give the demo a folder of its own` }
  if (entries === null || entries.length === 0 || entries.includes(DEMO_MARKER)) return { ok: true }
  return { ok: false, reason: `${out} already holds files the demo did not make; give the demo a folder of its own` }
}

/** The nights logged by hand in the demo: the first night of each of three targets, with notes and the target (DEV-015). */
export function demoLoggedNights(targets: readonly DemoTarget[] = DEMO_TARGETS): Array<{ target: string; folder: string; date: string; notes: string; total_frames: number; total_exposure_sec: number }> {
  return targets.slice(0, 3).map(t => ({
    target: t.name,
    folder: t.folder,
    date: t.nights[0].date,
    notes: `Demo night on ${t.name}.`,
    total_frames: t.nights[0].subs,
    total_exposure_sec: t.nights[0].subs * t.nights[0].exposureSec
  }))
}
