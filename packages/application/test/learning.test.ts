import { describe, expect, it } from 'vitest'
import { makeDescribeObjectNumbers } from '@astro/application'
import { FixedClock, InMemoryTargetFacts } from '@astro/testkit'

describe('A target in numbers', () => {
  const targets = new InMemoryTargetFacts()
  targets.add('t-m31', { names: ['Andromeda Galaxy', 'NGC 224', 'M31'], angularSizeArcmin: 178 })
  targets.add('t-ngc7000', { names: ['North America Nebula', 'NGC 7000'], angularSizeArcmin: 120 })
  const describeNumbers = makeDescribeObjectNumbers({ targets, clock: new FixedClock(new Date('2026-12-31T23:59:00Z')) })

  it('[LRN-008] Given a target known by a Messier name, When it is described, Then its numbers come from that name', async () => {
    const n = await describeNumbers('t-m31')
    expect(n?.designation).toBe('M31')
    expect(n?.distanceLy).toBe(2_540_000)
    expect(n?.sizeLy).toBeCloseTo(131_516, 0)
  })

  it('[LRN-010] Given the clock, When a recent light is set against the calendar, Then this year is the clock\'s', async () => {
    const t = new InMemoryTargetFacts()
    t.add('t-m42', { names: ['M42'], angularSizeArcmin: null })
    const n = await makeDescribeObjectNumbers({ targets: t, clock: new FixedClock(new Date('2026-06-01T00:00:00Z')) })('t-m42')
    expect(n?.lookback.text).toBe('It set out around the year 682.')
  })

  it('[LRN-009] Given a target with no published distance or no target at all, When it is described, Then there are no numbers', async () => {
    expect(await describeNumbers('t-ngc7000')).toBeNull()
    expect(await describeNumbers('missing')).toBeNull()
  })
})
