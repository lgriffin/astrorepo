import { describe, it, expect } from 'vitest'
import { assessStackingReadiness, observingNightOf, type StackingPolicy } from '@astro/domain'
import { subs, stackAt, target } from '@astro/testkit'

const policy: StackingPolicy = { readyToStackSec: 2 * 3600, restackSec: 3600 }

describe('assessStackingReadiness', () => {
  describe('ready to stack', () => {
    it('[DSC-010] Given 8 h of subs over two nights and no stack, When assessed, Then it is ready to stack with integration, subs and nights', () => {
      const m81 = target('M 81', {
        subs: [...subs(1440, 10, '2026-03-01T21:00:00Z'), ...subs(1440, 10, '2026-03-05T21:00:00Z')]
      })

      expect(assessStackingReadiness(m81, policy)).toEqual({
        kind: 'ready-to-stack',
        targetId: m81.targetId,
        targetName: 'M 81',
        integrationSec: 28800,
        subCount: 2880,
        nights: 2
      })
    })

    it('[DSC-010] Given integration just below the threshold and no stack, When assessed, Then nothing is suggested', () => {
      const m1 = target('M 1', { subs: subs(719, 10, '2026-03-01T21:00:00Z') })
      expect(assessStackingReadiness(m1, policy)).toBeNull()
    })

    it('[DSC-010] Given integration exactly at the threshold, When assessed, Then it is ready to stack', () => {
      const m1 = target('M 1', { subs: subs(720, 10, '2026-03-01T21:00:00Z') })
      expect(assessStackingReadiness(m1, policy)?.kind).toBe('ready-to-stack')
    })

    it('[DSC-010] Given subs with no capture time, When assessed, Then they count toward integration but not nights', () => {
      const m1 = target('M 1', { subs: subs(720, 10, '2026-03-01T21:00:00Z').map(s => ({ ...s, capturedAt: null })) })
      expect(assessStackingReadiness(m1, policy)).toMatchObject({ integrationSec: 7200, nights: 0 })
    })
  })

  describe('restack', () => {
    it('[DSC-004] Given 2 h 10 m of subs after the newest stack, When assessed, Then a restack states the added integration', () => {
      const m101 = target('M 101', {
        subs: [...subs(1470, 10, '2026-02-01T21:00:00Z'), ...subs(780, 10, '2026-03-10T21:00:00Z')],
        stacks: [stackAt('2026-01-01T12:00:00Z'), stackAt('2026-02-15T12:00:00Z')]
      })

      expect(assessStackingReadiness(m101, policy)).toEqual({
        kind: 'restack',
        targetId: m101.targetId,
        targetName: 'M 101',
        addedSec: 7800,
        addedSubCount: 780,
        lastStackedAt: new Date('2026-02-15T12:00:00Z')
      })
    })

    it('[DSC-004] Given less new integration than the restack threshold, When assessed, Then nothing is suggested', () => {
      const m101 = target('M 101', {
        subs: subs(359, 10, '2026-03-10T21:00:00Z'),
        stacks: [stackAt('2026-02-15T12:00:00Z')]
      })
      expect(assessStackingReadiness(m101, policy)).toBeNull()
    })

    it('[DSC-004] Given a stack newer than every sub, When assessed, Then a large backlog of old subs does not trigger a restack', () => {
      const m101 = target('M 101', {
        subs: subs(5000, 10, '2026-02-01T21:00:00Z'),
        stacks: [stackAt('2026-03-01T12:00:00Z')]
      })
      expect(assessStackingReadiness(m101, policy)).toBeNull()
    })
  })
})

describe('observingNightOf', () => {
  it('[DSC-012] Given frames either side of midnight, When assigned a night, Then both belong to the night that began that evening', () => {
    expect(observingNightOf(new Date('2026-03-01T22:30:00Z'))).toBe('2026-03-01')
    expect(observingNightOf(new Date('2026-03-02T03:30:00Z'))).toBe('2026-03-01')
  })

  it('[DSC-012] Given a frame after noon, When assigned a night, Then it starts a new night', () => {
    expect(observingNightOf(new Date('2026-03-02T12:00:00Z'))).toBe('2026-03-02')
  })
})
