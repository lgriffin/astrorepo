import { describe, it, expect } from 'vitest'
import { makePlanForward } from '@astro/application'
import {
  FakeEphemeris,
  FixedClock,
  InMemoryFrameCatalogue,
  InMemoryPlanningSettings,
  InMemoryTargetPositions,
  subs,
  target
} from '@astro/testkit'

const london = { latitudeDeg: 51.5, longitudeDeg: -0.13, elevationM: 20 }
const NEW_MOONS = ['2026-10-10T15:50:36Z', '2026-11-09T07:02:42Z', '2026-12-09T00:52:31Z', '2027-01-07T20:25:05Z', '2027-02-06T15:56:47Z']

function setup(now = '2026-09-29T15:00:00Z') {
  const frames = new InMemoryFrameCatalogue()
    .add(target('M 31', { subs: subs(12, 300, '2026-09-20T21:00:00Z'), goalSec: 36000 }))
    .add(target('NGC 7000', { subs: subs(12, 300, '2026-09-21T21:00:00Z') }))
    .add(target('M 13', { subs: subs(24, 300, '2026-08-01T21:00:00Z') }))
    .add(target('M 45', { subs: subs(12, 300, '2026-09-10T21:00:00Z'), goalSec: 3600 }))
    .add(target('M 101', { subs: subs(12, 300, '2026-05-10T21:00:00Z'), finalCount: 1 }))
    .add(target('M 83', { subs: subs(12, 300, '2026-05-10T21:00:00Z') }))
  const positions = new InMemoryTargetPositions()
    .add({ targetId: 'target-m-31', raHours: 0.71, decDeg: 41.27, objectType: 'galaxy' })
    .add({ targetId: 'target-ngc-7000', raHours: 20.98, decDeg: 44.33, objectType: 'emission_nebula' })
    .add({ targetId: 'target-m-13', raHours: 16.69, decDeg: 36.46, objectType: 'globular_cluster' })
    .add({ targetId: 'target-m-45', raHours: 3.79, decDeg: 24.12, objectType: 'open_cluster' })
    .add({ targetId: 'target-m-101', raHours: 14.05, decDeg: 54.35, objectType: 'galaxy' })
  const settings = new InMemoryPlanningSettings(london, true)
  const ephemeris = new FakeEphemeris().setNewMoons(NEW_MOONS)
  const clock = new FixedClock(new Date(now))
  const plan = makePlanForward({ frames, positions, settings, ephemeris, clock })
  return { frames, positions, settings, ephemeris, clock, plan }
}



async function okPlan(run: () => ReturnType<ReturnType<typeof makePlanForward>>) {
  const p = await run()
  if (p.status !== 'ok') throw new Error('expected a plan')
  return p
}

describe('PlanForward', () => {
  it('[FWD-007] Given no site in settings, When the plan is asked for, Then it says so and computes no sky', async () => {
    const { settings, ephemeris, plan } = setup()
    settings.setSite(null)
    expect(await plan()).toEqual({ status: 'no-site' })
    expect(ephemeris.nightsRequested).toEqual([])
  })

  it('[FWD-006] Given a moonless night, When tonight is planned, Then only targets with coordinates and work left are listed, most hours first', async () => {
    const { plan } = setup()
    const p = await okPlan(plan)
    expect(p.tonight?.night).toBe('2026-09-29')
    const names = p.tonight?.choices.map(c => c.targetName) ?? []
    expect(names.sort()).toEqual(['M 13', 'M 31', 'NGC 7000'])
    const hours = p.tonight?.choices.map(c => c.usableHours) ?? []
    expect([...hours].sort((a, b) => b - a)).toEqual(hours)
  })

  it('[FWD-005] Given a bright moon tonight and a dual-band filter, When tonight is planned, Then only the emission nebula is suggested', async () => {
    const { ephemeris, plan } = setup()
    ephemeris.setMoon('2026-09-29', { altitudeDeg: 35, illumination: 0.88, raHours: 2.9, decDeg: 21 })
    const p = await okPlan(plan)
    expect(p.tonight?.choices.map(c => c.targetName)).toEqual(['NGC 7000'])
    expect(p.tonight?.noFilterForBrightMoon).toBe(false)
  })

  it('[FWD-005] Given a bright moon tonight and no such filter, When tonight is planned, Then nothing is suggested and the plan says the filter is missing', async () => {
    const { ephemeris, settings, plan } = setup()
    ephemeris.setMoon('2026-09-29', { altitudeDeg: 35, illumination: 0.88, raHours: 2.9, decDeg: 21 })
    settings.setNarrowband(false)
    const p = await okPlan(plan)
    expect(p.tonight?.choices).toEqual([])
    expect(p.tonight?.noFilterForBrightMoon).toBe(true)
  })

  it('[FWD-002] Given a summer cluster low in the west, When the plan is made, Then its season is closing within 30 days and the autumn targets are not', async () => {
    const { plan } = setup()
    const p = await okPlan(plan)
    expect(p.closing.map(c => c.targetName)).toEqual(['M 13'])
    const [m13] = p.closing
    expect(m13.daysLeft).toBeGreaterThan(3)
    expect(m13.daysLeft).toBeLessThanOrEqual(30)
    expect(m13.hoursTonight).toBeGreaterThanOrEqual(1)
  })

  it('[FWD-004] Given new moons ahead, When the plan is made, Then each one in the next 90 days has a dark window and up to three best targets', async () => {
    const { plan } = setup()
    const p = await okPlan(plan)
    expect(p.windows.map(w => [w.newMoon, w.start, w.end])).toEqual([
      ['2026-10-10', '2026-10-07', '2026-10-13'],
      // 07:02 UTC on 9 Nov and 00:52 UTC on 9 Dec fall in London's nights of the 8th.
      ['2026-11-08', '2026-11-05', '2026-11-11'],
      ['2026-12-08', '2026-12-05', '2026-12-11']
    ])
    for (const w of p.windows) {
      expect(w.bestTargets.length).toBeLessThanOrEqual(3)
      expect(w.bestTargets.every(t => t.usableHours >= 1)).toBe(true)
      expect(w.bestTargets.map(t => t.targetName)).not.toContain('M 45')
    }
    expect(p.windows[2].bestTargets[0].targetName).toBe('M 31')
  })

  it('[FWD-004] Given more targets than a window names, When the plan is made, Then only the three with the most hours are named', async () => {
    const { frames, positions, plan } = setup()
    for (const [name, ra] of [['NGC 891', 2.38], ['NGC 7331', 22.62], ['M 33', 1.56]] as const) {
      frames.add(target(name, { subs: subs(4, 300, '2026-09-20T21:00:00Z') }))
      positions.add({ targetId: `target-${name.toLowerCase().replace(/ /g, '-')}`, raHours: ra, decDeg: 38, objectType: 'galaxy' })
    }
    const p = await okPlan(plan)
    expect(p.windows[0].bestTargets).toHaveLength(3)
  })

  it('[FWD-001] Given tracked targets, When the plan is made, Then each target with work left has 12 months of hours with its best month and new moons marked', async () => {
    const { plan } = setup()
    const p = await okPlan(plan)
    expect(p.seasons.map(s => s.targetName)).toEqual(['M 13', 'M 31', 'NGC 7000'])
    for (const s of p.seasons) {
      expect(s.months).toHaveLength(12)
      expect(s.months[0].month).toBe('2026-09')
      expect(s.months[11].month).toBe('2027-08')
      const best = s.months.find(m => m.month === s.bestMonth)
      expect(best).toBeDefined()
      expect(s.months.every(m => m.hoursPerNight <= (best?.hoursPerNight ?? 0))).toBe(true)
    }
    const m31 = p.seasons.find(s => s.targetName === 'M 31')
    expect(['2026-09', '2026-10', '2026-11']).toContain(m31?.bestMonth)
    const m13 = p.seasons.find(s => s.targetName === 'M 13')
    expect(['2027-05', '2027-06', '2027-07']).toContain(m13?.bestMonth)
    expect(m31?.months.find(m => m.month === '2026-10')?.newMoons).toEqual(['2026-10-10'])
  })

  it('[FWD-006] Given a morning after the night’s darkness has ended, When the plan is made, Then tonight is the coming evening, not the night just gone', async () => {
    const { plan } = setup('2026-09-30T06:00:00Z')
    const p = await okPlan(plan)
    expect(p.tonight?.night).toBe('2026-09-30')
  })

  it('[FWD-006] Given the small hours while it is still dark, When the plan is made, Then tonight is the night in progress', async () => {
    const { plan } = setup('2026-09-30T01:00:00Z')
    expect((await okPlan(plan)).tonight?.night).toBe('2026-09-29')
  })

  it('[FWD-001] Given a new moon earlier in the current month, When the plan is made, Then the current month is still marked with it', async () => {
    const { plan } = setup('2026-10-20T15:00:00Z')
    const p = await okPlan(plan)
    const m31 = p.seasons.find(s => s.targetName === 'M 31')
    expect(m31?.months[0]).toMatchObject({ month: '2026-10', newMoons: ['2026-10-10'] })
    expect(p.windows[0].newMoon).toBe('2026-11-08')
  })

  it('[DSC-016] Given goals per filter with Ha past its goal and OIII not started, When tonight is planned, Then the target is still short by the whole OIII goal', async () => {
    const { frames, positions, plan } = setup()
    frames.add(
      target('NGC 6960', {
        subs: subs(24, 300, '2026-09-20T21:00:00Z', { filter: 'Ha' }),
        goalSec: 7200,
        filterGoals: [
          { filter: 'ha', goalSec: 3600 },
          { filter: 'OIII', goalSec: 3600 }
        ]
      })
    )
    positions.add({ targetId: 'target-ngc-6960', raHours: 20.76, decDeg: 30.7, objectType: 'supernova_remnant' })
    const p = await okPlan(plan)
    expect(p.tonight?.choices.find(c => c.targetName === 'NGC 6960')?.shortOfGoalSec).toBe(3600)
  })

  it('[FWD-008] Given a night with no dark window, When tonight is planned, Then there is no tonight plan but the rest of the plan stands', async () => {
    const { ephemeris, plan } = setup()
    ephemeris.noDarkness('2026-09-29')
    const p = await okPlan(plan)
    expect(p.tonight).toBeNull()
    expect(p.seasons).toHaveLength(3)
  })

  it('[FWD-008] Given a night with only nautical darkness, When tonight is planned, Then the plan says it is nautical', async () => {
    const { ephemeris, plan } = setup()
    ephemeris.nauticalOnly('2026-09-29')
    expect((await okPlan(plan)).tonight?.darkness).toBe('nautical')
  })

  it('[NFR-009] Given the tonight scope, When the plan is made, Then only tonight and the closing nights are computed and windows and seasons are empty', async () => {
    const { ephemeris, plan } = setup()
    const p = await okPlan(() => plan({ scope: 'tonight' }))
    expect(p.tonight?.night).toBe('2026-09-29')
    expect(p.closing.map(c => c.targetName)).toContain('M 13')
    expect(p.windows).toEqual([])
    expect(p.seasons).toEqual([])
    expect(ephemeris.nightsRequested.length).toBe(35)
  })

  it('[NFR-009] Given many targets, When the plan is made, Then each night is computed once, and adding targets computes no more nights', async () => {
    const small = setup()
    await small.plan()
    const requested = small.ephemeris.nightsRequested
    expect(new Set(requested).size).toBe(requested.length)

    const big = setup()
    for (let i = 0; i < 40; i++) {
      big.frames.add(target(`Extra ${i}`, { subs: subs(4, 300, '2026-09-20T21:00:00Z') }))
      big.positions.add({ targetId: `target-extra-${i}`, raHours: (i * 0.6) % 24, decDeg: 20 + i, objectType: 'galaxy' })
    }
    await big.plan()
    expect(big.ephemeris.nightsRequested.length).toBe(requested.length)
  })
})
