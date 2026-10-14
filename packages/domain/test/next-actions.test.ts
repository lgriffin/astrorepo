import { describe, it, expect } from 'vitest'
import { captureActionId, rankNextActions, type StackingSuggestion, type TonightPlan } from '@astro/domain'

const ready = (name: string, hours: number): StackingSuggestion => ({
  kind: 'ready-to-stack',
  id: `ready-to-stack:target-${name}`,
  targetId: `target-${name}`,
  targetName: name,
  integrationSec: hours * 3600,
  subCount: hours * 12,
  nights: 2
})

const restack = (name: string, hours: number): StackingSuggestion => ({
  kind: 'restack',
  id: `restack:target-${name}`,
  targetId: `target-${name}`,
  targetName: name,
  addedSec: hours * 3600,
  addedSubCount: hours * 12,
  lastStackedAt: new Date('2026-09-01T00:00:00Z')
})

const tonight = (...choices: [string, number][]): TonightPlan => ({
  night: '2026-09-29',
  darkStart: new Date('2026-09-29T19:30:00Z'),
  darkEnd: new Date('2026-09-30T04:00:00Z'),
  darkness: 'astronomical',
  moonIllumination: 0.1,
  moonUp: true,
  brightMoon: false,
  noFilterForBrightMoon: false,
  choices: choices.map(([name, hours]) => ({
    targetId: `target-${name}`,
    targetName: name,
    usableHours: hours,
    moonSeparationDeg: null,
    shortOfGoalSec: name === 'M31' ? 7200 : null,
    channel: name === 'M31' ? { filter: 'OIII', haveSec: 600, leadFilter: 'Ha', leadSec: 7200 } : null
  }))
})

const labels = (actions: ReturnType<typeof rankNextActions>) =>
  actions.map(a => (a.kind === 'capture' ? `shoot ${a.targetName}` : a.kind === 'stack' ? `stack ${a.suggestion.targetName}` : a.kind === 'mosaic-tile' ? `tile ${a.tile}` : `messier ${a.number}`))

describe('rankNextActions', () => {
  it('[DSC-007] Given captures and stacks, When ranked, Then closing seasons lead, then other captures by hours, then stacks by waiting integration', () => {
    const actions = rankNextActions(
      [ready('M42', 3), restack('M81', 5)],
      tonight(['M31', 7], ['M13', 1.5], ['M27', 4], ['NGC7000', 6]),
      [
        { targetId: 'target-M27', daysLeft: 20 },
        { targetId: 'target-M13', daysLeft: 6 }
      ]
    )
    expect(labels(actions)).toEqual(['shoot M13', 'shoot M27', 'shoot M31', 'shoot NGC7000', 'stack M81', 'stack M42'])
  })

  it('[DSC-016] Given a capture, When ranked, Then it carries hours, moon, days left and shortfall, under an id for that night', () => {
    const [m31] = rankNextActions([], tonight(['M31', 7]), [{ targetId: 'target-M31', daysLeft: 25 }])
    expect(m31).toEqual({
      kind: 'capture',
      id: captureActionId('target-M31', '2026-09-29'),
      targetId: 'target-M31',
      targetName: 'M31',
      night: '2026-09-29',
      usableHours: 7,
      moonSeparationDeg: null,
      closesInDays: 25,
      shortOfGoalSec: 7200,
      channel: { filter: 'OIII', haveSec: 600, leadFilter: 'Ha', leadSec: 7200 },
      filter: null
    })
    expect(m31.kind === 'capture' && m31.id).toBe('capture:target-M31:2026-09-29')
  })

  it('[DSC-017] Given no tonight plan, When ranked, Then only the stacking suggestions come back, in their own order', () => {
    expect(labels(rankNextActions([ready('M42', 3), restack('M81', 5), ready('M1', 3)], null, []))).toEqual(['stack M81', 'stack M1', 'stack M42'])
  })

  it('[DSC-007] Given a closing target not up tonight, When ranked, Then it adds no capture', () => {
    expect(rankNextActions([], tonight(['M31', 7]), [{ targetId: 'target-M13', daysLeft: 3 }]).map(a => a.kind === 'capture' && a.targetName)).toEqual(['M31'])
  })

  it('[DSC-007] Given captures that tie on days left or on hours, When ranked, Then more hours lead and then the name decides', () => {
    const ranked = rankNextActions(
      [],
      tonight(['M8', 3], ['M2', 3], ['M5', 4], ['M9', 2], ['M7', 2]),
      [
        { targetId: 'target-M9', daysLeft: 5 },
        { targetId: 'target-M7', daysLeft: 5 }
      ]
    )
    expect(labels(ranked)).toEqual(['shoot M7', 'shoot M9', 'shoot M5', 'shoot M2', 'shoot M8'])
  })

  it('[DSC-007] [SKY-012] Given captures, mosaic tiles and stacks, When ranked, Then tiles come between them, soonest visible, then by target and tile', () => {
    const gap = (targetName: string, tile: number, nights: string[]) => ({ targetId: `id-${targetName}`, targetName, tile, of: 4, nights, lookedAt: 30, goalSec: 3600 })
    const ranked = rankNextActions(
      [ready('M42', 3)],
      tonight(['M13', 2]),
      [],
      [gap('NGC 7000', 3, ['2026-10-10']), gap('M 31', 4, ['2026-10-10']), gap('M 31', 2, ['2026-10-10']), gap('IC 1396', 1, []), gap('M 33', 1, ['2026-10-09'])]
    )
    expect(ranked.map(a => (a.kind === 'mosaic-tile' ? `${a.targetName}#${a.tile}` : a.kind))).toEqual([
      'capture', 'M 33#1', 'M 31#2', 'M 31#4', 'NGC 7000#3', 'IC 1396#1', 'stack'
    ])
    expect(ranked[1]).toEqual({ kind: 'mosaic-tile', id: 'mosaic-tile:id-M 33:1', targetId: 'id-M 33', targetName: 'M 33', tile: 1, of: 4, nights: ['2026-10-09'], lookedAt: 30, goalSec: 3600 })
  })

  it('[DSC-016] [RIG-010] Given a filter-wheel target with a filter to capture, When ranked, Then the capture carries that filter', () => {
    const plan = tonight(['M31', 7])
    const filter = { filter: 'Ha', family: 'narrowband' as const, brightMoon: true, suitsMoon: true, haveSec: 600, lag: null }
    const [m31] = rankNextActions([], { ...plan, choices: plan.choices.map(c => ({ ...c, filter })) }, [])
    expect(m31.kind === 'capture' && m31.filter).toEqual(filter)
    expect(m31.kind === 'capture' && m31.closesInDays).toBeNull()
  })

  it('[MES-008] Given Messier gaps up tonight, When ranked, Then they come after captures and mosaic tiles and before stacking, in the order given, and one already a capture is left out', () => {
    const messier = (n: number, targetName: string, hours: number) => ({ number: n, designation: `M${n}`, targetId: `target-${targetName}`, targetName, usableHours: hours, moonSeparationDeg: null, closesInDays: null })
    const tile = { targetId: 'id-M 31', targetName: 'M 31', tile: 2, of: 4, nights: ['2026-10-10'], lookedAt: 30, goalSec: null }
    const ranked = rankNextActions([ready('M42', 3)], tonight(['M13', 2]), [], [tile], [messier(51, 'M51', 6), messier(13, 'M13', 5), messier(101, 'M101', 4)])
    expect(ranked.map(a => (a.kind === 'messier-gap' ? `gap ${a.targetName}` : a.kind))).toEqual(['capture', 'mosaic-tile', 'gap M51', 'gap M101', 'stack'])
    expect(ranked[2]).toEqual({ kind: 'messier-gap', id: 'messier-gap:target-M51:2026-09-29', number: 51, designation: 'M51', targetId: 'target-M51', targetName: 'M51', usableHours: 6, moonSeparationDeg: null, closesInDays: null })
  })

  it('[MES-008] Given Messier gaps and no plan for tonight, When ranked, Then they still lead stacking', () => {
    const ranked = rankNextActions([ready('M42', 3)], null, [], [], [{ number: 51, designation: 'M51', targetId: 't51', targetName: 'M51', usableHours: 6, moonSeparationDeg: 20, closesInDays: 3 }])
    expect(ranked.map(a => a.kind)).toEqual(['messier-gap', 'stack'])
  })
})
