import { describe, it, expect } from 'vitest'
import type { ForwardPlan } from '@astro/application'
import type { TonightPlan } from '@astro/domain'
import { NO_SITE_MESSAGE, shortDate, toForwardPlanView } from '../../src/main/adapters/planning-presenter'

const site = { latitudeDeg: 51.5, longitudeDeg: -0.13, elevationM: 20 }

const tonight = (over: Partial<TonightPlan> = {}): TonightPlan => ({
  night: '2026-09-29',
  darkStart: new Date('2026-09-29T19:34:48Z'),
  darkEnd: new Date('2026-09-30T04:07:17Z'),
  darkness: 'astronomical',
  moonIllumination: 0.2,
  brightMoon: false,
  noFilterForBrightMoon: false,
  choices: [
    { targetId: 'target-m-31', targetName: 'M 31', usableHours: 8.5, moonSeparationDeg: null },
    { targetId: 'target-m-33', targetName: 'M 33', usableHours: 6, moonSeparationDeg: 41 }
  ],
  ...over
})

const plan = (over: Partial<Extract<ForwardPlan, { status: 'ok' }>> = {}): ForwardPlan => ({
  status: 'ok',
  site,
  tonight: tonight(),
  closing: [],
  windows: [],
  seasons: [],
  ...over
})

describe('planning presenter', () => {
  it('[FWD-007] Given no site, When presented, Then the view says what to set', () => {
    expect(toForwardPlanView({ status: 'no-site' })).toEqual({ status: 'no-site', message: NO_SITE_MESSAGE })
    expect(NO_SITE_MESSAGE).toMatch(/latitude and longitude in Settings/)
  })

  it('[FWD-006] Given tonight choices, When presented, Then each says its hours above 30° and where the moon is', () => {
    const view = toForwardPlanView(plan())
    if (view.status !== 'ok' || !view.tonight) throw new Error('expected tonight')
    expect(view.tonight.darkStart).toBe('2026-09-29T19:34:48.000Z')
    expect(view.tonight.moonPercent).toBe(20)
    expect(view.tonight.moonNote).toBeNull()
    expect(view.tonight.choices.map(c => c.detail)).toEqual(['8 h 30 m above 30°, moon down', '6 h above 30°, moon 41° away'])
  })

  it('[FWD-005] Given a bright moon, When presented, Then the note says why the list is short or empty', () => {
    const withFilter = toForwardPlanView(plan({ tonight: tonight({ moonIllumination: 0.88, brightMoon: true }) }))
    const without = toForwardPlanView(plan({ tonight: tonight({ moonIllumination: 0.88, brightMoon: true, noFilterForBrightMoon: true, choices: [] }) }))
    if (withFilter.status !== 'ok' || without.status !== 'ok') throw new Error('expected plans')
    expect(withFilter.tonight?.moonNote).toBe('The moon is 88% lit, so only emission targets are suggested, for your dual-band or narrowband filter.')
    expect(without.tonight?.moonNote).toMatch(/^The moon is 88% lit, so nothing is suggested without a dual-band or narrowband filter/)
  })

  it('[FWD-008] Given nautical darkness or no dark window, When presented, Then the view says so', () => {
    const nautical = toForwardPlanView(plan({ tonight: tonight({ darkness: 'nautical' }) }))
    const none = toForwardPlanView(plan({ tonight: null }))
    if (nautical.status !== 'ok' || none.status !== 'ok') throw new Error('expected plans')
    expect(nautical.tonight?.darknessNote).toMatch(/nautical darkness/)
    expect(none.tonight).toBeNull()
  })

  it('[FWD-002] Given a closing season, When presented, Then it reads with the date, days left and tonight’s hours', () => {
    const view = toForwardPlanView(plan({ closing: [{ targetId: 'target-m-13', targetName: 'M 13', closesOn: '2026-10-11', daysLeft: 12, hoursTonight: 1.5 }] }))
    if (view.status !== 'ok') throw new Error('expected plan')
    expect(view.closing).toEqual([{ targetId: 'target-m-13', targetName: 'M 13', detail: 'Season closes around 11 Oct, 12 days left; 1 h 30 m a night now' }])
  })

  it('[FWD-004] Given new-moon windows, When presented, Then each is labelled with its dates and names its targets', () => {
    const view = toForwardPlanView(
      plan({ windows: [{ newMoon: '2026-10-10', start: '2026-10-07', end: '2026-10-13', bestTargets: [{ targetId: 'target-m-31', targetName: 'M 31', usableHours: 9 }] }] })
    )
    if (view.status !== 'ok') throw new Error('expected plan')
    expect(view.windows[0].label).toBe('New moon 10 Oct: dark nights 7 Oct to 13 Oct')
    expect(view.windows[0].targets).toEqual([{ targetId: 'target-m-31', targetName: 'M 31', detail: '9 h a night' }])
  })

  it('[FWD-001] Given seasons, When presented, Then months carry hours and whether they hold a new moon', () => {
    const view = toForwardPlanView(
      plan({
        seasons: [
          {
            targetId: 'target-m-31',
            targetName: 'M 31',
            bestMonth: '2026-10',
            months: [
              { month: '2026-10', hoursPerNight: 9, newMoons: ['2026-10-10'] },
              { month: '2026-11', hoursPerNight: 8.5, newMoons: [] }
            ]
          }
        ]
      })
    )
    if (view.status !== 'ok') throw new Error('expected plan')
    expect(view.seasons[0].months).toEqual([
      { month: '2026-10', hoursPerNight: 9, newMoon: true },
      { month: '2026-11', hoursPerNight: 8.5, newMoon: false }
    ])
    expect(shortDate('2027-01-07')).toBe('7 Jan')
  })
})
