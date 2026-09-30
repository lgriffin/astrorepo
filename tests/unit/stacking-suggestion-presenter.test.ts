import { describe, it, expect } from 'vitest'
import { formatDuration, toNextActionRecommendation, toRecommendation } from '../../src/main/adapters/stacking-suggestion-presenter'

describe('Stacking suggestion presenter', () => {
  it('[DSC-010] Given a ready-to-stack suggestion, When presented, Then it states integration, subs and nights', () => {
    const rec = toRecommendation({
      kind: 'ready-to-stack', id: 'ready-to-stack:t-m81', targetId: 't-m81', targetName: 'M 81', integrationSec: 29520, subCount: 2952, nights: 6
    })
    expect(rec).toMatchObject({
      category: 'stacking',
      priority: 'high',
      title: 'M 81 · 8 h 12 m, never stacked',
      description: '2952 subs across 6 nights are waiting to be stacked.',
      targetId: 't-m81',
      id: 'ready-to-stack:t-m81',
      dismissible: true
    })
  })

  it('[DSC-004] Given a restack suggestion, When presented, Then it states the integration added since the last stack', () => {
    const rec = toRecommendation({
      kind: 'restack', id: 'restack:t-m101', targetId: 't-m101', targetName: 'M 101', addedSec: 7800, addedSubCount: 1,
      lastStackedAt: new Date('2026-02-15T12:00:00Z')
    })
    expect(rec.title).toBe('M 101 · +2 h 10 m since last stack')
    expect(rec.description).toBe('1 newer sub captured after the stack of 2026-02-15. A restack would include them.')
  })

  it('[DSC-010] Given durations, When formatted, Then hours and minutes read naturally', () => {
    expect(formatDuration(45 * 60)).toBe('45 m')
    expect(formatDuration(2 * 3600)).toBe('2 h')
    expect(formatDuration(8 * 3600 + 12 * 60)).toBe('8 h 12 m')
  })

  it('[DSC-016] Given a closing capture, When presented, Then it is high priority and states hours, days left, shortfall and moon', () => {
    const r = toNextActionRecommendation({
      kind: 'capture', id: 'capture:target-m-13:2026-09-29', targetId: 'target-m-13', targetName: 'M 13', night: '2026-09-29',
      usableHours: 1.5, moonSeparationDeg: 64, closesInDays: 6, shortOfGoalSec: 3 * 3600
    })
    expect(r).toMatchObject({ category: 'capture', priority: 'high', dismissible: false, targetId: 'target-m-13' })
    expect(r.title).toBe('M 13 · shoot tonight, 1 h 30 m above 30°')
    expect(r.description).toBe('Its season closes in 6 days. 3 h short of your goal. The moon comes within 64°.')
  })

  it('[DSC-016] Given an ordinary capture with no goal and the moon down, When presented, Then it is medium priority and says the moon is down', () => {
    const r = toNextActionRecommendation({
      kind: 'capture', id: 'capture:target-m-31:2026-09-29', targetId: 'target-m-31', targetName: 'M 31', night: '2026-09-29',
      usableHours: 7, moonSeparationDeg: null, closesInDays: null, shortOfGoalSec: null
    })
    expect(r.priority).toBe('medium')
    expect(r.description).toBe('The moon is down while it is up.')
  })

  it('[DSC-007] Given a stack action, When presented, Then it reads exactly as the stacking suggestion did', () => {
    const suggestion = {
      kind: 'ready-to-stack' as const, id: 'ready-to-stack:target-m-42', targetId: 'target-m-42', targetName: 'M 42',
      integrationSec: 3 * 3600, subCount: 36, nights: 2
    }
    expect(toNextActionRecommendation({ kind: 'stack', suggestion })).toEqual(toRecommendation(suggestion))
  })
})
