import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { moonPath, tonightSummary } from '../../src/shared/tonight'
import type { ClearSkiesView, ForwardPlanView, NightSkyView, TonightView } from '../../src/shared/types'

const renderer = path.resolve(__dirname, '../../src/renderer')
const read = (rel: string) => fs.readFileSync(path.join(renderer, rel), 'utf8')

const night = (over: Partial<NightSkyView> = {}): NightSkyView => ({
  night: '2026-10-26',
  label: 'Tonight',
  verdict: 'clear',
  headline: 'Clear skies',
  darkStart: '2026-10-26T19:10:00Z',
  darkEnd: '2026-10-27T05:20:00Z',
  spellStart: null,
  spellEnd: null,
  figures: [],
  notes: [],
  warnings: [],
  ...over
})
const skies = (n: NightSkyView = night()): ClearSkiesView => ({ status: 'ok', nights: [n], sources: [], credit: null })

const tonight = (over: Partial<TonightView> = {}): TonightView => ({
  night: '2026-10-26',
  darkStart: '2026-10-26T19:12:00Z',
  darkEnd: '2026-10-27T05:18:00Z',
  darkness: 'astronomical',
  moonPercent: 22,
  moonSummary: 'moon 22% lit, sets 21:40',
  moonNote: null,
  darknessNote: null,
  choices: [1, 2, 3, 4].map(i => ({ targetId: `t${i}`, targetName: `M ${i}`, detail: `${i} h up` })),
  ...over
})
const plan = (t: TonightView | null = tonight()): ForwardPlanView => ({
  status: 'ok',
  site: { latitudeDeg: 53, longitudeDeg: -6 },
  tonight: t,
  closing: [],
  windows: [],
  seasons: []
})

describe('Tonight on Home (specs/041-look-and-feel V3)', () => {
  it('[LF-016] Given a clear forecast and a plan, When tonight is summed up, Then it says clear, the plan\'s dark window, the moon and the three best targets', () => {
    const s = tonightSummary(skies(), plan())
    expect(s).toMatchObject({ state: 'ok', headline: 'Clear skies tonight', verdict: 'clear', moonPercent: 22, moon: 'Moon 22% lit, sets 21:40' })
    expect(s.dark).toEqual({ start: '2026-10-26T19:12:00Z', end: '2026-10-27T05:18:00Z', darkness: 'astronomical' })
    expect(s.picks.map(p => p.targetName)).toEqual(['M 1', 'M 2', 'M 3'])
  })

  it('[LF-016] Given clear spells, When tonight is summed up, Then the clearest stretch is given', () => {
    const s = tonightSummary(skies(night({ verdict: 'clear-spells', spellStart: 'a', spellEnd: 'b' })), plan())
    expect(s.headline).toBe('Clear spells tonight')
    expect(s.spell).toEqual({ start: 'a', end: 'b' })
    // A spell on a clear night is the whole night, so it is not repeated.
    expect(tonightSummary(skies(night({ spellStart: 'a', spellEnd: 'b' })), plan()).spell).toBeNull()
  })

  it('[LF-016] Given the forecast switched off or still loading, When tonight is summed up, Then the plan alone still gives the dark window, moon and targets', () => {
    for (const forecast of [null, { status: 'off', message: 'off' } as ClearSkiesView]) {
      const s = tonightSummary(forecast, plan())
      expect(s).toMatchObject({ state: 'ok', headline: 'Tonight', verdict: null, moonPercent: 22 })
      expect(s.picks).toHaveLength(3)
    }
    // With only the forecast, its dark window stands in.
    expect(tonightSummary(skies(), null).dark).toEqual({ start: '2026-10-26T19:10:00Z', end: '2026-10-27T05:20:00Z', darkness: 'astronomical' })
    expect(tonightSummary(null, null).state).toBe('unknown')
  })

  it('[LF-016] Given no forecast for tonight yet, When tonight is summed up, Then the headline is just Tonight and a note says the sky is not judged', () => {
    const s = tonightSummary(skies(night({ verdict: 'no-forecast', headline: 'No forecast yet' })), plan())
    expect(s.headline).toBe('Tonight')
    expect(s.notes).toContain('There is no forecast for tonight yet, so the sky is not judged.')
    expect(s.picks).toHaveLength(3)
  })

  it('[LF-016] Given a moon or darkness note, or nothing up, When tonight is summed up, Then the notes say so', () => {
    expect(tonightSummary(null, plan(tonight({ darkness: 'nautical', darknessNote: 'Only nautical dark tonight.', moonNote: 'A bright moon: emission targets only.' }))).notes).toEqual([
      'Only nautical dark tonight.',
      'A bright moon: emission targets only.'
    ])
    expect(tonightSummary(null, plan(tonight({ choices: [] }))).notes).toEqual(['None of your targets with work left is up for an hour tonight.'])
  })

  it('[LF-018] Given a cloudy forecast, When tonight is summed up, Then no target is offered and the headline says why', () => {
    const s = tonightSummary(skies(night({ verdict: 'cloudy', headline: 'Cloudy' })), plan())
    expect(s.headline).toBe('Cloudy tonight')
    expect(s.picks).toEqual([])
  })

  it('[LF-018] Given no dark window, When tonight is summed up, Then it fails to find a night to shoot, offers no target and says the sun stays too high', () => {
    const s = tonightSummary(skies(night({ verdict: 'clear' })), plan(null))
    expect(s).toMatchObject({ verdict: 'no-darkness', headline: 'No dark window tonight', dark: null, picks: [] })
    expect(s.notes[0]).toContain('no dark window')
  })

  it('[LF-019] Given no site, When tonight is summed up, Then the panel asks for the site and links to Settings', () => {
    expect(tonightSummary({ status: 'no-site', message: 'x' }, null)).toMatchObject({ state: 'no-site', headline: 'Set your site to see tonight', picks: [] })
    expect(tonightSummary(null, { status: 'no-site', message: 'x' }).state).toBe('no-site')
    expect(read('components/cockpit/TonightHero.tsx')).toContain("settingsLink('location')")
  })

  it('[LF-016] Given the moon\'s lit share, When it is drawn, Then a new moon draws nothing, a crescent bulges right and a gibbous moon left', () => {
    expect(moonPath(0, 20)).toBe('')
    expect(moonPath(25, 20)).toBe('M 20 0 A 20 20 0 0 1 20 40 A 10 20 0 0 0 20 0 Z')
    expect(moonPath(50, 20)).toBe('M 20 0 A 20 20 0 0 1 20 40 A 0 20 0 0 0 20 0 Z')
    expect(moonPath(75, 20)).toBe('M 20 0 A 20 20 0 0 1 20 40 A 10 20 0 0 1 20 0 Z')
    expect(moonPath(140, 20)).toBe('M 20 0 A 20 20 0 0 1 20 40 A 20 20 0 0 1 20 0 Z')
    expect(read('components/cockpit/TonightHero.tsx')).toContain('aria-label={`Moon ${Math.round(percent)}% lit`}')
  })

  it('[LF-017] Given a suggestion on Home, When its priority is shown, Then the mark is named in words', () => {
    const home = read('pages/Dashboard.tsx')
    expect(home).toContain("high: 'High priority'")
    expect(home).toContain('aria-label={PRIORITY_WORDS[rec.priority]}')
  })
})
