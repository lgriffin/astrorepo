import { describe, it, expect } from 'vitest'
import { dataFingerprint, deriveProgress, discoverTarget, UNKNOWN_KEY, type StackingPolicy } from '@astro/domain'
import { subs, stackAt, target } from '@astro/testkit'

const policy: StackingPolicy = { readyToStackSec: 2 * 3600, restackSec: 3600 }

describe('discoverTarget', () => {
  it('[DSC-001] Given subs through two filters on two scopes over two nights, When discovered, Then integration is broken down by filter, scope and night', () => {
    const m42 = target('M 42', {
      subs: [
        ...subs(360, 10, '2026-01-10T21:00:00Z', { filter: 'IRCUT', scope: 'Seestar S50' }), // 1 h
        ...subs(180, 20, '2026-01-12T22:00:00Z', { filter: 'LP', scope: 'Seestar S50' }), //   1 h
        ...subs(60, 30, '2026-01-12T23:30:00Z', { filter: 'LP', scope: 'Vespera Pro' }) //     30 m
      ]
    })

    const d = discoverTarget(m42, policy)

    expect(d.integrationSec).toBe(9000)
    expect(d.subCount).toBe(600)
    expect(d.byFilter).toEqual([
      { key: 'LP', integrationSec: 5400, subCount: 240 },
      { key: 'IRCUT', integrationSec: 3600, subCount: 360 }
    ])
    expect(d.byScope).toEqual([
      { key: 'Seestar S50', integrationSec: 7200, subCount: 540 },
      { key: 'Vespera Pro', integrationSec: 1800, subCount: 60 }
    ])
    expect(d.byNight.map(b => [b.key, b.integrationSec])).toEqual([
      ['2026-01-10', 3600],
      ['2026-01-12', 5400]
    ])
  })

  it('[DSC-001] Given subs without FILTER or TELESCOP headers, When discovered, Then they are grouped as Unknown rather than dropped', () => {
    const d = discoverTarget(target('M 1', { subs: subs(6, 10, '2026-01-10T21:00:00Z') }), policy)
    expect(d.byFilter).toEqual([{ key: UNKNOWN_KEY, integrationSec: 60, subCount: 6 }])
    expect(d.byScope).toEqual([{ key: UNKNOWN_KEY, integrationSec: 60, subCount: 6 }])
  })

  it('[DSC-001] Given a sub with no capture time, When discovered, Then it counts toward integration but not toward any night', () => {
    const t = target('M 1', { subs: [{ exposureSec: 30, capturedAt: null, filter: null, scope: null, rejected: false }] })
    const d = discoverTarget(t, policy)
    expect(d.integrationSec).toBe(30)
    expect(d.byNight).toEqual([{ key: UNKNOWN_KEY, integrationSec: 30, subCount: 1 }])
    expect(d.unstackedNights).toEqual([])
    expect(d.lastCapturedAt).toBeNull()
  })

  it('[DSC-001] Given a stack between two sessions, When discovered, Then the last capture, the stack date and the nights not yet stacked are stated', () => {
    const m101 = target('M 101', {
      subs: [...subs(360, 10, '2026-02-01T21:00:00Z'), ...subs(360, 10, '2026-03-01T21:00:00Z')],
      stacks: [stackAt('2026-02-02T09:00:00Z')]
    })

    const d = discoverTarget(m101, policy)

    expect(d.lastCapturedAt?.toISOString()).toBe('2026-03-01T21:59:50.000Z')
    expect(d.stackCount).toBe(1)
    expect(d.lastStackedAt?.toISOString()).toBe('2026-02-02T09:00:00.000Z')
    expect(d.unstackedNights).toEqual(['2026-03-01'])
    expect(d.unstackedSec).toBe(3600)
  })

  it('[DSC-001] Given processed and final files and a goal, When discovered, Then they are carried through with the rejected sub count', () => {
    const t = target('M 31', {
      subs: [...subs(10, 10, '2026-01-10T21:00:00Z'), ...subs(2, 10, '2026-01-10T22:00:00Z', { rejected: true })],
      goalSec: 21600,
      processedCount: 2,
      finalCount: 1
    })
    const d = discoverTarget(t, policy)
    expect(d).toMatchObject({ goalSec: 21600, processedCount: 2, finalCount: 1, rejectedSubCount: 2 })
  })
})

describe('deriveProgress', () => {
  it('[DSC-009] Given only a goal, When progress is derived, Then the target is planned', () => {
    expect(deriveProgress(target('M 1', { goalSec: 3600 }), policy)).toBe('planned')
  })

  it('[DSC-009] Given subs below the ready-to-stack threshold, When progress is derived, Then the target is capturing', () => {
    expect(deriveProgress(target('M 1', { subs: subs(719, 10, '2026-01-10T21:00:00Z') }), policy)).toBe('capturing')
  })

  it('[DSC-009] Given subs at the ready-to-stack threshold and no stack, When progress is derived, Then the target has enough data', () => {
    expect(deriveProgress(target('M 1', { subs: subs(720, 10, '2026-01-10T21:00:00Z') }), policy)).toBe('enough-data')
  })

  it('[DSC-009] Given a stack, When progress is derived, Then the target is stacked', () => {
    expect(deriveProgress(target('M 1', { subs: subs(10, 10, '2026-01-10T21:00:00Z'), stacks: [stackAt('2026-01-11T09:00:00Z')] }), policy)).toBe('stacked')
  })

  it('[DSC-009] Given a processed file, When progress is derived, Then the target is processed even without an indexed stack', () => {
    expect(deriveProgress(target('M 1', { processedCount: 1 }), policy)).toBe('processed')
  })

  it('[DSC-009] Given a final image, When progress is derived, Then the target is final whatever else it has', () => {
    expect(deriveProgress(target('M 1', { processedCount: 3, finalCount: 1, stacks: [stackAt('2026-01-11T09:00:00Z')] }), policy)).toBe('final')
  })

  it('[DSC-009] Given no policy, When progress is derived, Then the default two-hour threshold applies', () => {
    expect(deriveProgress(target('M 1', { subs: subs(720, 10, '2026-01-10T21:00:00Z') }))).toBe('enough-data')
    expect(discoverTarget(target('M 1', { subs: subs(719, 10, '2026-01-10T21:00:00Z') })).progress).toBe('capturing')
  })
})

describe('dataFingerprint', () => {
  const base = target('M 81', { subs: subs(720, 10, '2026-03-01T21:00:00Z') })

  it('[DSC-008] Given the same data, When fingerprinted twice, Then the fingerprint is stable', () => {
    expect(dataFingerprint(base)).toBe(dataFingerprint(structuredClone(base)))
  })

  it('[DSC-008] Given a sub re-read with another quality verdict, filter or scope, When fingerprinted, Then the fingerprint changes', () => {
    const before = dataFingerprint(base)
    const change = (patch: object) => ({ ...base, subs: base.subs.map((s, i) => (i === 0 ? { ...s, ...patch } : s)) })
    expect(dataFingerprint(change({ rejected: true }))).not.toBe(before)
    expect(dataFingerprint(change({ filter: 'LP' }))).not.toBe(before)
    expect(dataFingerprint(change({ scope: 'Vespera Pro' }))).not.toBe(before)
  })

  it('[DSC-009] Given 2 h of subs of which some were rejected, When progress is derived, Then only usable subs count toward enough data', () => {
    const t = target('M 1', { subs: [...subs(700, 10, '2026-01-10T21:00:00Z'), ...subs(20, 10, '2026-01-10T23:00:00Z', { rejected: true })] })
    expect(deriveProgress(t, policy)).toBe('capturing')
  })

  it('[DSC-008] Given new subs, a new stack or a new output, When fingerprinted, Then the fingerprint changes', () => {
    const before = dataFingerprint(base)
    expect(dataFingerprint({ ...base, subs: [...base.subs, ...subs(1, 10, '2026-03-05T21:00:00Z')] })).not.toBe(before)
    expect(dataFingerprint({ ...base, stacks: [stackAt('2026-03-02T09:00:00Z')] })).not.toBe(before)
    expect(dataFingerprint({ ...base, processedCount: 1 })).not.toBe(before)
    expect(dataFingerprint({ ...base, finalCount: 1 })).not.toBe(before)
  })

  it('[DSC-008] Given known data, When fingerprinted, Then it is the counts and a 32-bit FNV-1a digest of the subs and of the stacks', () => {
    expect(dataFingerprint(target('M 1'))).toBe('0|0|0|0|811c9dc5|811c9dc5')
    const t = target('M 1', {
      subs: [
        { exposureSec: 5, capturedAt: null, filter: null, scope: null, rejected: true },
        ...subs(1, 10, '2026-01-10T21:00:00Z', { filter: 'Ha', scope: 'S50' })
      ],
      stacks: [stackAt('2026-01-11T09:00:00Z')],
      processedCount: 2,
      finalCount: 1
    })
    // FNV-1a of "-,5,,,1;2026-01-10T21:00:00.000Z,10,Ha,S50,0" and of "2026-01-11T09:00:00.000Z".
    expect(dataFingerprint(t)).toBe('2|1|2|1|8902d5ae|fd9e02ef')
    // The order subs and stacks were read in does not matter.
    expect(dataFingerprint({ ...t, subs: [...t.subs].reverse() })).toBe('2|1|2|1|8902d5ae|fd9e02ef')
    const twoStacks = [stackAt('2026-01-11T09:00:00Z'), stackAt('2026-01-12T09:00:00Z')]
    expect(dataFingerprint({ ...t, stacks: twoStacks })).toBe(dataFingerprint({ ...t, stacks: [...twoStacks].reverse() }))
  })
})

describe('discoverTarget, at the edges', () => {
  it('[DSC-001] Given filters that differ only in spacing, or tie on integration, When discovered, Then spacing is ignored, a blank key is Unknown and ties go alphabetically', () => {
    const t = target('M 1', {
      subs: [
        ...subs(2, 10, '2026-01-10T21:00:00Z', { filter: ' Ha ', scope: 'B' }),
        ...subs(1, 10, '2026-01-10T22:00:00Z', { filter: 'Ha', scope: 'A' }),
        ...subs(3, 10, '2026-01-10T23:00:00Z', { filter: '   ', scope: 'C' }),
        ...subs(3, 10, '2026-01-11T21:00:00Z', { filter: 'OIII', scope: 'A' })
      ]
    })
    const d = discoverTarget(t, policy)
    expect(d.byFilter).toEqual([
      { key: 'Ha', integrationSec: 30, subCount: 3 },
      { key: 'OIII', integrationSec: 30, subCount: 3 },
      { key: UNKNOWN_KEY, integrationSec: 30, subCount: 3 }
    ])
    expect(d.byScope).toEqual([
      { key: 'A', integrationSec: 40, subCount: 4 },
      { key: 'C', integrationSec: 30, subCount: 3 },
      { key: 'B', integrationSec: 20, subCount: 2 }
    ])
    // Nights sort by date even when a later night holds more integration.
    expect(d.byNight.map(b => [b.key, b.subCount])).toEqual([['2026-01-10', 6], ['2026-01-11', 3]])
    expect(d.unstackedNights).toEqual(['2026-01-10', '2026-01-11'])
    expect(d.lastCapturedAt?.toISOString()).toBe('2026-01-11T21:00:20.000Z')
  })

  it('[DSC-001] Given stacks listed out of order and a sub taken at the very moment of the newest, When discovered, Then the newest stack counts and that sub is already in it', () => {
    const t = target('M 1', {
      subs: [
        { exposureSec: 60, capturedAt: new Date('2026-03-01T21:00:00Z'), filter: null, scope: null, rejected: false },
        { exposureSec: 60, capturedAt: new Date('2026-03-01T21:00:01Z'), filter: null, scope: null, rejected: false },
        { exposureSec: 60, capturedAt: new Date('2026-01-01T21:00:00Z'), filter: null, scope: null, rejected: false },
        { exposureSec: 60, capturedAt: null, filter: null, scope: null, rejected: false },
        { exposureSec: 60, capturedAt: new Date('2026-03-05T21:00:00Z'), filter: null, scope: null, rejected: true }
      ],
      stacks: [stackAt('2026-02-01T09:00:00Z'), stackAt('2026-03-01T21:00:00Z'), stackAt('2026-01-05T09:00:00Z')]
    })
    const d = discoverTarget(t, policy)
    expect(d.lastStackedAt?.toISOString()).toBe('2026-03-01T21:00:00.000Z')
    expect(d.unstackedSec).toBe(60)
    expect(d.unstackedNights).toEqual(['2026-03-01'])
    expect(d.lastCapturedAt?.toISOString()).toBe('2026-03-05T21:00:00.000Z')
    expect(d.integrationSec).toBe(300)
    expect(d).toMatchObject({ targetId: 'target-m-1', targetName: 'M 1', subCount: 5, rejectedSubCount: 1, stackCount: 3, goalSec: null, progress: 'stacked' })
  })

  it('[DSC-009] Given rejected subs alone above the threshold, When progress is derived, Then the target is still capturing', () => {
    expect(deriveProgress(target('M 1', { subs: subs(720, 10, '2026-01-10T21:00:00Z', { rejected: true }) }), policy)).toBe('capturing')
    expect(deriveProgress(target('M 1', { subs: subs(1, 10, '2026-01-10T21:00:00Z') }), { readyToStackSec: 10, restackSec: 1 })).toBe('enough-data')
  })
})
