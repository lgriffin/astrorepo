import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  buildSession,
  DESTINATION_FOLDER,
  destinationFolderName,
  FILE_KINDS,
  INCLUDED_KINDS,
  inventorySession,
  MAX_FOLDER_NAME,
  normaliseTargetName,
  parseDestinationFolder,
  parseSessionFolder,
  planTransfer,
  type IncludedKind,
  type ScopeEntry
} from '@astro/domain'
import { anyText, propertyParams, withPermutation } from './arbitraries'

const pad = (n: number, w = 2) => String(n).padStart(w, '0')
const date = fc.record({ y: fc.integer({ min: 2000, max: 2099 }), m: fc.integer({ min: 1, max: 12 }), d: fc.integer({ min: 1, max: 28 }) }).map(({ y, m, d }) => `${y}-${pad(m)}-${pad(d)}`)
const time = fc.tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }), fc.integer({ min: 0, max: 59 })).map(([h, m, s]) => `${pad(h)}-${pad(m)}-${pad(s)}`)
const kinds = fc.subarray([...INCLUDED_KINDS] as IncludedKind[], { minLength: 1 })

/** Files a run might hold: frames, stack outputs, sidecars, TIFFs and strays. */
const runFile = fc.oneof(
  fc.integer({ min: 1, max: 60 }).map(n => `img-${pad(n, 4)}.fits`),
  fc.integer({ min: 1, max: 60 }).map(n => `img-${pad(n, 4)}-output.jpg`),
  fc.integer({ min: 1, max: 60 }).map(n => `img-${pad(n, 4)}-output.json`),
  fc.integer({ min: 1, max: 60 }).map(n => `img-${pad(n, 4)}-stacking.json`),
  fc.integer({ min: 1, max: 60 }).map(n => `img-${pad(n, 4)}.tif`),
  fc.constantFrom('capture.json', 'notes.txt', 'IMG-0001.FITS')
)
const run = fc.tuple(fc.constantFrom('01-pointing-initial', '02-images-initial', '03-images-adjust-framing', '04-images-adjust-focus', 'misc'), fc.uniqueArray(runFile, { maxLength: 30 }))
const entries = (names: string[]): ScopeEntry[] => names.map(name => ({ name, type: 'file', sizeBytes: name.length, modifiedAt: null }))
const sessionOf = (runs: [string, string[]][]) =>
  buildSession('2024-06-15_21-00-54_observation_M31', [], runs.map(([folder, names]) => ({ folder, entries: entries(names) })), new Date(0))

describe('Vespera ingest properties', () => {
  it('[VIN-017, FUZ-006] Given any target, date, counts and duplicate, When a folder is named, Then it fits 80 characters, matches the grammar and reads back the same', () => {
    fc.assert(
      fc.property(anyText, date, kinds, fc.array(fc.nat({ max: 100_000 }), { minLength: 4, maxLength: 4 }), fc.option(fc.integer({ min: 2, max: 999 }), { nil: undefined }), (name, d, include, n, duplicate) => {
        const counts = Object.fromEntries(include.map((k, i) => [k, n[i]])) as Partial<Record<IncludedKind, number>>
        const folder = destinationFolderName({ target: { name }, date: d, counts, duplicate })
        expect(folder.length).toBeLessThanOrEqual(MAX_FOLDER_NAME)
        expect(folder).toMatch(DESTINATION_FOLDER)
        expect(parseDestinationFolder(folder)).toEqual({ target: folder.split('_')[0], date: d, counts, duplicate: duplicate ?? null })
      }),
      propertyParams()
    )
  })

  it('[VIN-002, FUZ-006] Given any timestamp, kind and label, When a session folder is named and read, Then it reads back the same', () => {
    fc.assert(
      fc.property(date, time, fc.constantFrom('observation', 'auto-init', 'sun-mode', 'planet-mode'), fc.option(fc.string({ minLength: 1, maxLength: 30 }).filter(s => !/[\r\n\u2028\u2029]/.test(s)), { nil: null }), (d, t, kind, label) => {
        const parsed = parseSessionFolder(`${d}_${t}_${kind}${label === null ? '' : `_${label}`}`)
        expect(parsed).toEqual({ kind, startedAt: `${d}T${t.replace(/-/g, ':')}`, rawLabel: label })
      }),
      propertyParams()
    )
  })

  it('[VIN-007, FUZ-006] Given any runs, When inventoried, Then the totals add up to every file and the per-run counts to the totals', () => {
    fc.assert(
      fc.property(fc.uniqueArray(run, { selector: r => r[0], maxLength: 5 }), runs => {
        const inv = inventorySession(sessionOf(runs))
        const files = runs.reduce((s, [, names]) => s + names.length, 0)
        expect(FILE_KINDS.reduce((s, k) => s + inv.totals[k], 0)).toBe(files)
        for (const k of FILE_KINDS) expect(Object.values(inv.perRun).reduce((s, c) => s + c[k], 0)).toBe(inv.totals[k])
      }),
      propertyParams()
    )
  })

  it('[VIN-019, FUZ-006] Given a session listed in any order, When a transfer is planned, Then the plan is the same, holds exactly the included kinds and keeps kind order', () => {
    const rank: Record<IncludedKind, number> = { fits: 0, jpeg: 1, tiff: 2, json: 3 }
    fc.assert(
      fc.property(withPermutation(fc.uniqueArray(run, { selector: r => r[0], maxLength: 4 })), kinds, ([runs, shuffled], include) => {
        const a = planTransfer(sessionOf(runs), include)
        const b = planTransfer(sessionOf(shuffled.map(([f, names]) => [f, [...names].reverse()] as [string, string[]])), include)
        expect(b).toEqual(a)
        expect(a.every(i => include.includes(i.kind))).toBe(true)
        const inv = inventorySession(sessionOf(runs))
        for (const k of include) expect(a.filter(i => i.kind === k)).toHaveLength(inv.totals[k])
        for (let i = 1; i < a.length; i++) expect(rank[a[i - 1].kind]).toBeLessThanOrEqual(rank[a[i].kind])
      }),
      propertyParams()
    )
  })

  it('[VIN-012, FUZ-006] Given any name, When normalised twice, Then the second changes nothing', () => {
    fc.assert(
      fc.property(fc.oneof(anyText, fc.tuple(fc.constantFrom('m', 'M', 'ngc', 'NGC', 'ic', 'IC', 'Sh2', 'sh 2'), fc.constantFrom('', ' ', '-', '_'), fc.integer({ min: 0, max: 9999 }), fc.constantFrom('', '_15_18', ' omega')).map(p => p.join(''))), raw => {
        const once = normaliseTargetName(raw)
        if (once === null) return
        expect(normaliseTargetName(once.name)?.name).toBe(once.name)
      }),
      propertyParams()
    )
  })
})
