import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  MESSIER_COUNT,
  MESSIER_FILTERS,
  compareOutlooks,
  messierGapsTonight,
  messierNumber,
  messierOutlook,
  messierSummary,
  orderPictures,
  showsUnder,
  type MessierOutlook,
  type MessierState,
  type PictureCandidate
} from '@astro/domain'
import { anyText, instant, propertyParams, withPermutation } from './arbitraries'

const hours = fc.double({ min: 0, max: 14, noNaN: true })
const month = fc.integer({ min: 0, max: 23 }).map(i => `${2026 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`)
const outlook: fc.Arbitrary<MessierOutlook | null> = fc.oneof(
  fc.constant(null),
  fc.record({ kind: fc.constant('tonight' as const), hours, moonSeparationDeg: fc.option(fc.integer({ min: 0, max: 180 }), { nil: null }), closesInDays: fc.option(fc.integer({ min: 1, max: 30 }), { nil: null }) }),
  fc.record({ kind: fc.constant('moon' as const), hours }),
  fc.record({ kind: fc.constant('later' as const), fromMonth: month, bestMonth: month }),
  fc.constant({ kind: 'never' as const })
)
const state = fc.constantFrom<MessierState>('imaged', 'stacked', 'captured', 'gap')
/** Tiles with distinct Messier numbers, as the catalogue gives them. */
const tiles = fc.uniqueArray(
  fc.record({ number: fc.integer({ min: 1, max: MESSIER_COUNT }), state, outlook }).map(t => ({ ...t, designation: `M${t.number}`, targetId: `m${t.number}`, targetName: `M${t.number}` })),
  { selector: t => t.number, maxLength: 40 }
)
const picture: fc.Arbitrary<PictureCandidate> = fc.record({
  path: fc.tuple(fc.string({ unit: fc.constantFrom(...'abcxyz_-'.split('')), minLength: 1, maxLength: 6 }), fc.constantFrom('.jpg', '.JPEG', '.png', '.tif', '.fits', '.fit', '.fts', '.txt', '.cr2', '')).map(([stem, ext]) => stem + ext),
  kind: fc.constantFrom('finished' as const, 'master' as const),
  colour: fc.option(fc.boolean(), { nil: null }),
  modifiedAt: fc.option(instant, { nil: null })
})

describe('Messier mosaic invariants', () => {
  it('[MES-008, FUZ-006] Given any outlooks, When compared, Then the order is total: antisymmetric, transitive and the same whatever order they came in', () => {
    fc.assert(
      fc.property(withPermutation(tiles), ([xs, shuffled]) => {
        for (const a of xs) {
          expect(compareOutlooks(a, a)).toBe(0)
          for (const b of xs) {
            const ab = compareOutlooks(a, b)
            expect(Number.isNaN(ab)).toBe(false)
            expect(Math.sign(ab)).toBe(-Math.sign(compareOutlooks(b, a)) || 0)
          }
        }
        const sorted = [...xs].sort(compareOutlooks).map(t => t.number)
        expect([...shuffled].sort(compareOutlooks).map(t => t.number)).toEqual(sorted)
        for (let i = 1; i < sorted.length; i++) {
          const prev = xs.find(t => t.number === sorted[i - 1])!
          const next = xs.find(t => t.number === sorted[i])!
          expect(compareOutlooks(prev, next)).toBeLessThan(0)
        }
      }),
      propertyParams()
    )
  })

  it('[MES-001, MES-006, FUZ-006] Given any tiles, When counted and filtered, Then the states add up, and each filter shows a subset of the one before it', () => {
    fc.assert(
      fc.property(tiles, xs => {
        const s = messierSummary(xs)
        expect(s.total).toBe(MESSIER_COUNT)
        expect(s.imaged + s.stacked + s.captured + s.gaps).toBe(xs.length)
        expect(s.missingUpTonight).toBe(xs.filter(t => showsUnder('tonight', t)).length)
        expect(xs.every(t => showsUnder('all', t))).toBe(true)
        for (const t of xs) {
          if (showsUnder('gaps', t)) expect(showsUnder('missing', t)).toBe(true)
          if (showsUnder('tonight', t)) expect(showsUnder('missing', t)).toBe(true)
        }
        expect(MESSIER_FILTERS.length).toBe(4)
      }),
      propertyParams()
    )
  })

  it('[MES-008, FUZ-006] Given any tiles and limit, When tonight’s gaps are picked, Then each is an uncaptured object up tonight, none repeats, and there are no more than the limit', () => {
    fc.assert(
      fc.property(tiles, fc.integer({ min: -2, max: 8 }), (xs, limit) => {
        const gaps = messierGapsTonight(xs, limit)
        expect(gaps.length).toBeLessThanOrEqual(Math.max(0, limit))
        expect(new Set(gaps.map(g => g.number)).size).toBe(gaps.length)
        for (const g of gaps) {
          const t = xs.find(x => x.number === g.number)!
          expect(t.state).toBe('gap')
          expect(t.outlook?.kind).toBe('tonight')
          expect(g.usableHours).toBe((t.outlook as { hours: number }).hours)
        }
      }),
      propertyParams()
    )
  })

  it('[MES-003, FUZ-006] Given any images, When ordered for a tile, Then only drawable ones remain, each once, finished before masters, whatever order they came in', () => {
    fc.assert(
      fc.property(withPermutation(fc.uniqueArray(picture, { selector: p => p.path, maxLength: 12 })), ([xs, shuffled]) => {
        const order = orderPictures(xs)
        expect(orderPictures(shuffled).map(p => p.path)).toEqual(order.map(p => p.path))
        expect(new Set(order.map(p => p.path)).size).toBe(order.length)
        const firstMaster = order.findIndex(p => p.kind === 'master')
        if (firstMaster >= 0) expect(order.slice(firstMaster).every(p => p.kind === 'master')).toBe(true)
        for (const p of order) expect(/\.(jpe?g|png|tif|fits?|fts)$/i.test(p.path)).toBe(true)
        expect(order.filter(p => p.kind === 'master').every(p => /\.(fits?|fts)$/i.test(p.path))).toBe(true)
      }),
      propertyParams()
    )
  })

  it('[MES-005, FUZ-006] Given any night and months, When the outlook is worked out, Then up tonight needs the minimum hours, and later names months it was given', () => {
    fc.assert(
      fc.property(
        fc.option(fc.record({ hours, moonSeparationDeg: fc.constant(null), moonBlocks: fc.boolean() }), { nil: null }),
        fc.uniqueArray(fc.record({ month, hoursPerNight: hours }), { selector: m => m.month, maxLength: 12 }),
        (tonight, months) => {
          const o = messierOutlook({ tonight, closing: null, months })
          if (o.kind === 'tonight' || o.kind === 'moon') expect(tonight!.hours).toBeGreaterThanOrEqual(1)
          if (o.kind === 'moon') expect(tonight!.moonBlocks).toBe(true)
          if (o.kind === 'later') {
            expect(months.map(m => m.month)).toContain(o.fromMonth)
            expect(months.find(m => m.month === o.bestMonth)!.hoursPerNight).toBe(Math.max(...months.map(m => m.hoursPerNight)))
          }
          if (o.kind === 'never') expect(months.every(m => m.hoursPerNight < 1)).toBe(true)
        }
      ),
      propertyParams()
    )
  })

  it('[MES-001, FUZ-004] Given any text, When read as a designation, Then it is a whole number from 1 to 110 or nothing', () => {
    fc.assert(
      fc.property(anyText, text => {
        const n = messierNumber(text)
        if (n !== null) {
          expect(Number.isInteger(n)).toBe(true)
          expect(n).toBeGreaterThanOrEqual(1)
          expect(n).toBeLessThanOrEqual(MESSIER_COUNT)
        }
      }),
      propertyParams()
    )
    fc.assert(
      fc.property(fc.integer({ min: 1, max: MESSIER_COUNT }), n => {
        expect(messierNumber(`M ${n}`)).toBe(n)
      }),
      propertyParams()
    )
  })
})
