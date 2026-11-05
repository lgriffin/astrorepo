import { describe, expect, it } from 'vitest'
import type { SkyInsight } from '@astro/domain'
import { SKY_INSIGHT_NO_SITE_MESSAGE, toSkyInsightView } from '../../src/main/adapters/sky-insight-presenter'

const insight = (over: Partial<SkyInsight> = {}): SkyInsight => ({
  night: '2026-11-05',
  dark: { start: new Date('2026-11-05T18:40:00Z'), end: new Date('2026-11-06T05:00:00Z'), hours: 10.3, darkness: 'astronomical', changeMinutes: 7 },
  moon: { percent: 10, trend: 'waning', upHours: 1, upSpans: [{ start: new Date('2026-11-06T04:00:00Z'), end: new Date('2026-11-06T05:00:00Z') }], moonFreeHours: 9.3 },
  cloud: { state: 'forecast', verdict: 'clear-spells', cloudPct: 40, clearHours: 4, spell: null, dew: true },
  sky: { bortle: 3, name: 'Rural sky', sqm: 21.8, from: 'reading' },
  faint: 'possible',
  summary: 'Possible for faint targets: clear spells only.',
  ...over
})

describe('sky insight presenter', () => {
  it('[NSI-001] [NSI-002] [NSI-005] Given tonight, When shown, Then each tile reads in words with ISO times', () => {
    const v = toSkyInsightView({ status: 'ok', insight: insight() })
    expect(v).toMatchObject({
      status: 'ok',
      faint: 'possible',
      faintLabel: 'Possible',
      dark: { start: '2026-11-05T18:40:00.000Z', text: '10 h 18 min', change: '7 min longer than last night', darkness: 'astronomical' },
      moon: { phase: 'Waning crescent', up: 'Up for 1 h of the dark', spans: [{ start: '2026-11-06T04:00:00.000Z', end: '2026-11-06T05:00:00.000Z' }], moonFree: '9 h 18 min' },
      cloud: { state: 'forecast', headline: 'Clear spells', cloudPct: 40, detail: '4 h clear of 10 h 18 min dark', dew: true },
      sky: { bortle: 3, name: 'Rural sky', sqm: 21.8, from: 'reading' }
    })
  })

  it('[NSI-001] [NSI-002] Given a shorter night and the Moon down or up throughout, When shown, Then the words follow', () => {
    const down = toSkyInsightView({ status: 'ok', insight: insight({ dark: { ...insight().dark!, changeMinutes: -65 }, moon: { ...insight().moon!, upHours: 0, upSpans: [] } }) })
    if (down.status !== 'ok') throw new Error('not ok')
    expect(down.dark?.change).toBe('1 h 5 min shorter than last night')
    expect(down.moon?.up).toBe('Down all through the dark')
    const up = toSkyInsightView({ status: 'ok', insight: insight({ dark: { ...insight().dark!, changeMinutes: 0 }, moon: { ...insight().moon!, upHours: 10.3 } }) })
    if (up.status !== 'ok') throw new Error('not ok')
    expect(up.moon?.up).toBe('Up all through the dark')
    expect(up.dark?.change).toBeNull()
  })

  it('[NSI-008] Given the forecast off or not readable, When shown, Then the cloud tile says which', () => {
    const off = toSkyInsightView({ status: 'ok', insight: insight({ cloud: { state: 'off' } }) })
    const failed = toSkyInsightView({ status: 'ok', insight: insight({ cloud: { state: 'unavailable' } }) })
    if (off.status !== 'ok' || failed.status !== 'ok') throw new Error('not ok')
    expect(off.cloud.headline).toBe('Forecast off')
    expect(failed.cloud.headline).toBe('Forecast unavailable')
    const none = toSkyInsightView({ status: 'ok', insight: insight({ cloud: { state: 'forecast', verdict: 'no-forecast', cloudPct: null, clearHours: null, spell: null, dew: false } }) })
    if (none.status !== 'ok') throw new Error('not ok')
    expect(none.cloud.detail).toMatch(/does not reach/)
    const station = toSkyInsightView({ status: 'ok', insight: insight({ cloud: { state: 'forecast', verdict: 'clear', cloudPct: 10, clearHours: null, spell: null, dew: false } }) })
    if (station.status !== 'ok') throw new Error('not ok')
    expect(station.cloud).toMatchObject({ headline: 'Clear', detail: 'From your weather service’s cloud figure.' })
  })

  it('[NSI-006] [NSI-009] Given no dark window or no site, When shown, Then there is no moon tile, or the message to set the site', () => {
    const dark = toSkyInsightView({ status: 'ok', insight: insight({ dark: null, moon: null, faint: 'none', sky: null }) })
    if (dark.status !== 'ok') throw new Error('not ok')
    expect(dark.moon).toBeNull()
    expect(dark.faintLabel).toBe('No proper dark')
    expect(dark.sky).toBeNull()
    expect(toSkyInsightView({ status: 'no-site' })).toEqual({ status: 'no-site', message: SKY_INSIGHT_NO_SITE_MESSAGE })
  })
})

describe('Tonight’s sky, shared with the renderer', () => {
  it('[NSI-003] Given the domain’s scale, When the renderer’s names are read, Then they match, and the settings keys too', async () => {
    const { BORTLE_CLASSES, SKY_QUALITY_KEYS } = await import('@astro/domain')
    const { BORTLE_NAMES, SKY_QUALITY_SETTING } = await import('../../src/shared/sky-insight')
    expect(BORTLE_NAMES).toEqual(BORTLE_CLASSES.map(c => c.name))
    expect(SKY_QUALITY_SETTING).toEqual(SKY_QUALITY_KEYS)
  })

  it('[NSI-001] [NSI-002] Given a dark window from 18:00 to 06:00 with the Moon up from 04:00, When the strip is laid out, Then it starts at noon and places both', async () => {
    const { nightStrip } = await import('../../src/shared/sky-insight')
    const local = (d: number, h: number) => new Date(2026, 10, d, h, 0, 0).toISOString()
    const s = nightStrip(local(5, 18), local(6, 6), [{ start: local(5, 19), end: local(5, 20) }, { start: local(6, 4), end: local(6, 6) }])
    expect(s.from.getHours()).toBe(12)
    expect(s.dark.left).toBeCloseTo(0.25)
    expect(s.dark.width).toBeCloseTo(0.5)
    expect(s.moon).toHaveLength(2)
    expect(s.moon[1].left).toBeCloseTo(16 / 24)
    expect(s.moon[1].width).toBeCloseTo(2 / 24)
    expect(nightStrip(local(6, 1), local(6, 5), []).dark.left).toBeCloseTo(13 / 24)
  })

  it('[NSI-001] Given the night the clocks go back, When the strip is laid out, Then it runs noon to noon by the calendar and midnight is not mid-strip', async () => {
    const { nightStrip } = await import('../../src/shared/sky-insight')
    const local = (d: number, h: number) => new Date(2026, 9, d, h, 0, 0).toISOString()
    const s = nightStrip(local(24, 18), local(25, 6), [])
    const length = new Date(2026, 9, 25, 12).getTime() - new Date(2026, 9, 24, 12).getTime()
    // Wherever the test runs, the strip's end is the next local noon.
    expect(s.dark.left).toBeCloseTo((new Date(2026, 9, 24, 18).getTime() - s.from.getTime()) / length)
    expect(s.dark.left + s.dark.width).toBeCloseTo((new Date(2026, 9, 25, 6).getTime() - s.from.getTime()) / length)
  })

  it('[NSI-004] Given a reading typed in Settings, When it is checked, Then only 16 to 22.5 passes and a blank is fine', async () => {
    const { sqmProblem } = await import('../../src/shared/sky-insight')
    expect(sqmProblem('')).toBeNull()
    expect(sqmProblem('21.3')).toBeNull()
    expect(sqmProblem('30')).toMatch(/between 16 and 22.5/)
    expect(sqmProblem('dark')).not.toBeNull()
  })
})
