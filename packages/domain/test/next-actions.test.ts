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
  actions.map(a => (a.kind === 'capture' ? `shoot ${a.targetName}` : a.kind === 'stack' ? `stack ${a.suggestion.targetName}` : `tile ${a.tile}`))

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
      channel: { filter: 'OIII', haveSec: 600, leadFilter: 'Ha', leadSec: 7200 }
    })
    expect(m31.kind === 'capture' && m31.id).toBe('capture:target-M31:2026-09-29')
  })

  it('[DSC-017] Given no tonight plan, When ranked, Then only the stacking suggestions come back, in their own order', () => {
    expect(labels(rankNextActions([ready('M42', 3), restack('M81', 5), ready('M1', 3)], null, []))).toEqual(['stack M81', 'stack M1', 'stack M42'])
  })

  it('[DSC-007] Given a closing target not up tonight, When ranked, Then it adds no capture', () => {
    expect(rankNextActions([], tonight(['M31', 7]), [{ targetId: 'target-M13', daysLeft: 3 }]).map(a => a.kind === 'capture' && a.targetName)).toEqual(['M31'])
  })
})
