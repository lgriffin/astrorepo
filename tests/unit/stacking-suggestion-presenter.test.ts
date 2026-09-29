import { describe, it, expect } from 'vitest'
import { formatDuration, toRecommendation } from '../../src/main/adapters/stacking-suggestion-presenter'

describe('Stacking suggestion presenter', () => {
  it('[DSC-010] Given a ready-to-stack suggestion, When presented, Then it states integration, subs and nights', () => {
    const rec = toRecommendation({
      kind: 'ready-to-stack', targetId: 't-m81', targetName: 'M 81', integrationSec: 29520, subCount: 2952, nights: 6
    })
    expect(rec).toMatchObject({
      category: 'stacking',
      priority: 'high',
      title: 'M 81 · 8 h 12 m, never stacked',
      description: '2952 subs across 6 nights are waiting to be stacked.',
      targetId: 't-m81'
    })
  })

  it('[DSC-004] Given a restack suggestion, When presented, Then it states the integration added since the last stack', () => {
    const rec = toRecommendation({
      kind: 'restack', targetId: 't-m101', targetName: 'M 101', addedSec: 7800, addedSubCount: 1,
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
})
