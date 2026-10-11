import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  PROGRESS_STATES,
  assessStackingReadiness,
  dataFingerprint,
  deriveProgress,
  discoverTarget,
  isDismissed,
  rankNextActions,
  unprocessedSec,
  type LightSub,
  type MosaicTileGap,
  type StackingSuggestion,
  type TargetFrames,
  type TonightChoice,
  type TonightPlan
} from '@astro/domain'
import { instant, propertyParams, withPermutation } from './arbitraries'

const sub: fc.Arbitrary<LightSub> = fc.record({
  exposureSec: fc.integer({ min: 1, max: 600 }),
  capturedAt: fc.option(instant, { nil: null }),
  filter: fc.option(fc.constantFrom('Ha', 'OIII', 'L', ' L ', ''), { nil: null }),
  scope: fc.option(fc.constantFrom('Seestar S50', 'RedCat 51'), { nil: null }),
  rejected: fc.boolean()
})
const targetFrames = (subs: fc.Arbitrary<LightSub[]> = fc.array(sub, { maxLength: 40 })): fc.Arbitrary<TargetFrames> =>
  fc.record({
    targetId: fc.constant('t1'),
    targetName: fc.constant('M 42'),
    subs,
    stacks: fc.array(instant.map(producedAt => ({ producedAt })), { maxLength: 3 }),
    goalSec: fc.option(fc.nat({ max: 100_000 }), { nil: null }),
    processedCount: fc.nat({ max: 2 }),
    finalCount: fc.nat({ max: 2 })
  })

describe('what the files say about a target', () => {
  it('[DSC-001, DSC-009, FUZ-006] Given any target, When discovered, Then integration by filter, scope and night each add up to the whole, and what waits for a stack is no more than the usable whole', () => {
    fc.assert(
      fc.property(targetFrames(), t => {
        const d = discoverTarget(t)
        for (const buckets of [d.byFilter, d.byScope, d.byNight]) {
          expect(buckets.reduce((n, b) => n + b.integrationSec, 0)).toBe(d.integrationSec)
          expect(buckets.reduce((n, b) => n + b.subCount, 0)).toBe(d.subCount)
        }
        expect(d.unstackedSec).toBeLessThanOrEqual(t.subs.filter(s => !s.rejected).reduce((n, s) => n + s.exposureSec, 0))
        expect(PROGRESS_STATES).toContain(d.progress)
        expect(d.progress).toBe(deriveProgress(t))
      }),
      propertyParams()
    )
  })

  it('[DSC-008, FUZ-006] Given the same data in any order, When fingerprinted, Then the fingerprint is the same, so a dismissal holds', () => {
    fc.assert(
      fc.property(targetFrames(), fc.nat(), (t, seed) => {
        const rotate = <T>(xs: T[]) => (xs.length ? [...xs.slice(seed % xs.length), ...xs.slice(0, seed % xs.length)] : xs)
        const reordered = { ...t, subs: rotate([...t.subs].reverse()), stacks: [...t.stacks].reverse() }
        expect(dataFingerprint(reordered)).toBe(dataFingerprint(t))
        const dismissal = { suggestionId: 'ready-to-stack:t1', targetId: 't1', fingerprint: dataFingerprint(t), dismissedAt: new Date(0) }
        expect(isDismissed(dismissal, dataFingerprint(reordered))).toBe(true)
      }),
      propertyParams()
    )
  })

  it('[DSC-008, FUZ-006] Given a target, When a sub is added or one is newly rejected, Then the fingerprint changes, so a dismissed suggestion can come back', () => {
    fc.assert(
      fc.property(targetFrames(), sub, (t, extra) => {
        expect(dataFingerprint({ ...t, subs: [...t.subs, extra] })).not.toBe(dataFingerprint(t))
        const i = t.subs.findIndex(s => !s.rejected)
        if (i >= 0) expect(dataFingerprint({ ...t, subs: t.subs.map((s, k) => (k === i ? { ...s, rejected: true } : s)) })).not.toBe(dataFingerprint(t))
      }),
      propertyParams()
    )
  })

  it('[DSC-010, DSC-004, FUZ-006] Given any target, When its stacking readiness is assessed, Then a suggestion counts only usable subs and never more than the target has', () => {
    fc.assert(
      fc.property(targetFrames(), t => {
        const s = assessStackingReadiness(t)
        if (!s) return
        const usable = t.subs.filter(x => !x.rejected)
        if (s.kind === 'ready-to-stack') {
          expect(t.stacks).toHaveLength(0)
          expect(s.subCount).toBe(usable.length)
        } else expect(s.addedSubCount).toBeLessThanOrEqual(usable.length)
        expect(unprocessedSec(s)).toBeLessThanOrEqual(usable.reduce((n, x) => n + x.exposureSec, 0))
      }),
      propertyParams()
    )
  })
})

describe('next actions', () => {
  const name = (i: number) => `Target ${String(i).padStart(3, '0')}`
  const choices = fc.uniqueArray(fc.nat({ max: 999 }), { maxLength: 8 }).chain(ids =>
    fc.tuple(...ids.map(i => fc.record({ usableHours: fc.double({ min: 1, max: 12, noNaN: true }), closes: fc.option(fc.integer({ min: 0, max: 30 }), { nil: null }) }).map(c => ({ i, ...c }))))
  )
  const stacking = fc.uniqueArray(fc.nat({ max: 999 }), { maxLength: 8 }).chain(ids =>
    fc.tuple(...ids.map(i => fc.integer({ min: 0, max: 100_000 }).map((sec): StackingSuggestion => ({ kind: 'ready-to-stack', id: `s${i}`, targetId: `s${i}`, targetName: name(i), integrationSec: sec, subCount: 1, nights: 1 }))))
  )
  const tiles = fc.uniqueArray(fc.nat({ max: 999 }), { maxLength: 6 }).chain(ids =>
    fc.tuple(...ids.map(i => fc.option(fc.constantFrom('2026-03-01', '2026-03-05'), { nil: undefined }).map((night): MosaicTileGap => ({ targetId: `m${i}`, targetName: name(i), tile: 1, of: 4, nights: night ? [night] : [], lookedAt: 30, goalSec: null }))))
  )
  const input = fc.tuple(choices, withPermutation(stacking.map(xs => [...xs])), tiles)

  it('[DSC-007, DSC-017, FUZ-006] Given any captures, tiles and stacking suggestions, When ranked, Then every one is listed once, captures first, then tiles, then stacking, each section in its own order', () => {
    fc.assert(
      fc.property(input, ([caps, [stacks], gaps]) => {
        const tonight: TonightPlan = { night: '2026-03-01', darkStart: new Date(0), darkEnd: new Date(0), darkness: 'astronomical', moonIllumination: 0, moonUp: false, brightMoon: false, noFilterForBrightMoon: false, choices: caps.map((c): TonightChoice => ({ targetId: `c${c.i}`, targetName: name(c.i), usableHours: c.usableHours, moonSeparationDeg: null, shortOfGoalSec: null, channel: null })) }
        const closing = caps.filter(c => c.closes !== null).map(c => ({ targetId: `c${c.i}`, daysLeft: c.closes as number }))
        const ranked = rankNextActions(stacks, tonight, closing, gaps)
        expect(ranked.map(a => a.kind)).toEqual([...caps.map(() => 'capture'), ...gaps.map(() => 'mosaic-tile'), ...stacks.map(() => 'stack')])
        const captured = ranked.filter(a => a.kind === 'capture') as Extract<(typeof ranked)[number], { kind: 'capture' }>[]
        for (let k = 1; k < captured.length; k++) {
          const [a, b] = [captured[k - 1], captured[k]]
          const [ua, ub] = [a.closesInDays ?? Infinity, b.closesInDays ?? Infinity]
          expect(ua <= ub).toBe(true)
          if (ua === ub) expect(a.usableHours).toBeGreaterThanOrEqual(b.usableHours)
        }
        const stacked = ranked.flatMap(a => (a.kind === 'stack' ? [unprocessedSec(a.suggestion)] : []))
        expect(stacked).toEqual([...stacked].sort((x, y) => y - x))
      }),
      propertyParams()
    )
  })

  it('[DSC-007, DSC-011, FUZ-006] Given the same suggestions in any order, When ranked, Then the ranking is the same; and with no night only stacking remains', () => {
    fc.assert(
      fc.property(input, ([, [stacks, shuffledStacks], gaps]) => {
        const ids = (xs: ReturnType<typeof rankNextActions>) => xs.map(a => (a.kind === 'stack' ? a.suggestion.id : a.id))
        expect(ids(rankNextActions(shuffledStacks, null, [], gaps))).toEqual(ids(rankNextActions(stacks, null, [], gaps)))
        expect(rankNextActions(stacks, null, []).every(a => a.kind === 'stack')).toBe(true)
      }),
      propertyParams()
    )
  })
})
