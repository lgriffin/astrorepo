import { describe, expect, it } from 'vitest'
import {
  filterFamily,
  filterFolderName,
  filterTotals,
  filterWorkDir,
  framesForFilter,
  planFilterStacks,
  planTonight,
  sameFilter,
  suggestFilter,
  type FilterFrame,
  type NightSky
} from '@astro/domain'
import { subs, target } from '@astro/testkit'

const frames = (folder: FilterFrame['folder'], filter: string | null, n: number): FilterFrame[] => Array.from({ length: n }, () => ({ folder, filter }))

describe('filter names', () => {
  it('[RIG-010] Given filter names, When classified, Then narrowband lines and broadband colours are named and smart-scope filters are neither', () => {
    for (const n of ['Ha', 'H-alpha', 'Halpha', 'OIII', 'O3', 'SII', 'S2', 'NII', 'Hb', 'Ha 7nm', 'OIII (3nm)', 'oiii_3nm']) expect(filterFamily(n)).toBe('narrowband')
    for (const n of ['L', 'Lum', 'Luminance', 'R', 'Red', 'G', 'Green', 'B', 'Blue', 'Clear']) expect(filterFamily(n)).toBe('broadband')
    for (const n of ['LP', 'IRCUT', 'L-eXtreme', 'Dual band', '', null, undefined]) expect(filterFamily(n)).toBeNull()
  })

  it('[RIG-008] Given two spellings, When compared, Then case and spaces at the ends do not matter and a missing filter matches nothing', () => {
    expect(sameFilter(' ha ', 'Ha')).toBe(true)
    expect(sameFilter('Ha', 'OIII')).toBe(false)
    expect(sameFilter(null, null)).toBe(false)
    expect(sameFilter('', '')).toBe(false)
  })

  it('[RIG-006] Given filter names, When given a work folder, Then the folder is safe on every disk and spelt as the work folder is', () => {
    expect(filterFolderName('Ha 7nm')).toBe('Ha_7nm')
    expect(filterFolderName(' O/III ')).toBe('O_III')
    expect(filterFolderName('***')).toBe('unnamed')
    expect(filterWorkDir('D:\\Astro\\work\\M42', 'Ha')).toBe('D:\\Astro\\work\\M42\\filters\\Ha')
    expect(filterWorkDir('/work/M42/', 'OIII')).toBe('/work/M42/filters/OIII')
  })
})

describe('one stack per filter', () => {
  it('[RIG-009] Given a folder of frames, When one filter is taken, Then its lights and flats come with every dark and bias', () => {
    const all = [...frames('lights', 'Ha', 2), ...frames('lights', 'OIII', 3), ...frames('flats', 'ha', 1), ...frames('flats', 'OIII', 1), ...frames('darks', null, 4), ...frames('biases', null, 5)]
    const ha = framesForFilter(all, 'Ha')
    expect(ha.filter(f => f.folder === 'lights')).toHaveLength(2)
    expect(ha.filter(f => f.folder === 'flats')).toHaveLength(1)
    expect(ha.filter(f => f.folder === 'darks')).toHaveLength(4)
    expect(ha.filter(f => f.folder === 'biases')).toHaveLength(5)
  })

  it('[RIG-006] [RIG-008] Given mono lights in three filters, When planned, Then each filter is a stack with its own flats, and gaps and unfiltered frames are named', () => {
    const plan = planFilterStacks([
      ...frames('lights', 'OIII', 30),
      ...frames('lights', 'Ha', 40),
      ...frames('lights', 'SII', 20),
      ...frames('lights', null, 2),
      ...frames('flats', 'Ha', 15),
      ...frames('flats', 'oiii', 15),
      ...frames('flats', null, 3),
      ...frames('darks', null, 20),
      ...frames('biases', null, 50)
    ])
    expect(plan?.filters).toEqual([
      { filter: 'Ha', folderName: 'Ha', lights: 40, flats: 15 },
      { filter: 'OIII', folderName: 'OIII', lights: 30, flats: 15 },
      { filter: 'SII', folderName: 'SII', lights: 20, flats: 0 }
    ])
    expect(plan).toMatchObject({ darks: 20, biases: 50, unfilteredLights: 2, unfilteredFlats: 3, flatsMissing: ['SII'] })
  })

  it('[RIG-016] Given one filter, or lights with no filter, When planned, Then there is no per-filter plan', () => {
    expect(planFilterStacks([...frames('lights', 'L', 10), ...frames('flats', 'L', 5)])).toBeNull()
    expect(planFilterStacks(frames('lights', null, 10))).toBeNull()
  })
})

describe('the filter to capture tonight', () => {
  const sho = target('NGC 6888', {
    subs: [
      ...subs(72, 300, '2026-09-01T21:00:00Z', { filter: 'Ha' }),
      ...subs(8, 300, '2026-09-02T21:00:00Z', { filter: 'OIII' }),
      ...subs(40, 300, '2026-09-03T21:00:00Z', { filter: 'SII' })
    ]
  })
  const lrgb = target('M 101', {
    subs: [
      ...subs(100, 300, '2026-04-01T21:00:00Z', { filter: 'L' }),
      ...subs(30, 300, '2026-04-02T21:00:00Z', { filter: 'R' }),
      ...subs(30, 300, '2026-04-03T21:00:00Z', { filter: 'G' }),
      ...subs(6, 300, '2026-04-04T21:00:00Z', { filter: 'B' })
    ]
  })

  it('[RIG-010] Given a bright moon and a lagging narrowband channel, When a filter is suggested, Then it is that channel with both totals', () => {
    expect(suggestFilter(filterTotals(sho, { withLuminance: true }), true)).toEqual({
      filter: 'OIII',
      family: 'narrowband',
      brightMoon: true,
      suitsMoon: true,
      haveSec: 2400,
      lag: { filter: 'OIII', haveSec: 2400, leadFilter: 'Ha', leadSec: 21600 }
    })
  })

  it('[RIG-010] Given a dark moon on an LRGB target, When a filter is suggested, Then it is the lagging colour, never luminance as the lead', () => {
    const s = suggestFilter(filterTotals(lrgb, { withLuminance: true }), false)
    expect(s).toMatchObject({ filter: 'B', family: 'broadband', suitsMoon: true, lag: { filter: 'B', leadFilter: 'R' } })
  })

  it('[RIG-010] Given a balanced family, When a filter is suggested, Then it is the least captured of the family the moon calls for', () => {
    const t = target('M 16', { subs: [...subs(10, 300, '2026-07-01T22:00:00Z', { filter: 'Ha' }), ...subs(8, 300, '2026-07-01T23:00:00Z', { filter: 'OIII' }), ...subs(9, 60, '2026-07-02T22:00:00Z', { filter: 'R' }), ...subs(10, 60, '2026-07-02T23:00:00Z', { filter: 'G' })] })
    expect(suggestFilter(filterTotals(t, { withLuminance: true }), true)).toMatchObject({ filter: 'OIII', lag: null, suitsMoon: true })
    expect(suggestFilter(filterTotals(t, { withLuminance: true }), false)).toMatchObject({ filter: 'R', lag: null, suitsMoon: true })
  })

  it('[RIG-010] Given a dark moon on a narrowband-only target, When a filter is suggested, Then its own filters are used and the moon is not given as the reason', () => {
    expect(suggestFilter(filterTotals(sho, { withLuminance: true }), false)).toMatchObject({ filter: 'OIII', suitsMoon: false, brightMoon: false })
  })

  it('[RIG-016] Given a smart scope\'s filter or a single named filter, When a filter is suggested, Then there is none', () => {
    const seestar = target('M 31', { subs: [...subs(100, 10, '2026-09-01T21:00:00Z', { filter: 'IRCUT' }), ...subs(50, 10, '2026-09-02T21:00:00Z', { filter: 'LP' })] })
    expect(suggestFilter(filterTotals(seestar, { withLuminance: true }), true)).toBeNull()
    expect(suggestFilter(filterTotals(target('M 42', { subs: subs(10, 60, '2026-01-01T21:00:00Z', { filter: 'Ha' }) }), { withLuminance: true }), true)).toBeNull()
  })

  it('[RIG-010] Given a filter goal with no frames, When totals are taken, Then it counts at nothing, and luminance only when asked', () => {
    const t = target('M 101', { subs: subs(4, 300, '2026-04-01T21:00:00Z', { filter: 'L' }), filterGoals: [{ filter: 'R', goalSec: 3600 }] })
    expect(filterTotals(t)).toEqual([{ filter: 'R', sec: 0 }])
    expect(filterTotals(t, { withLuminance: true })).toEqual([{ filter: 'L', sec: 1200 }, { filter: 'R', sec: 0 }])
  })

  it('[RIG-010] Given tonight\'s plan, When a filter-wheel target is chosen, Then the choice carries the filter for the moon; one-shot colour carries none', () => {
    const start = new Date('2026-09-29T20:00:00Z')
    const sky: NightSky = {
      night: '2026-09-29',
      darkStart: start,
      darkEnd: new Date(start.getTime() + 8 * 3600_000),
      darkness: 'astronomical',
      stepHours: 0.5,
      samples: Array.from({ length: 16 }, (_, i) => ({ at: new Date(start.getTime() + i * 1800_000), lstHours: 20 + i / 2, moonAltitudeDeg: 30, moonIllumination: 0.9, moonRaHours: 2, moonDecDeg: 10 }))
    }
    const site = { latitudeDeg: 51.5, longitudeDeg: -0.13, elevationM: 0 }
    const base = { raHours: 20.2, decDeg: 38.4, objectType: 'emission_nebula', integrationSec: 3600, shortOfGoalSec: null, hasFinal: false }
    const plan = planTonight(sky, site, [
      { ...base, targetId: 't-1', targetName: 'NGC 6888', filters: filterTotals(sho, { withLuminance: true }) },
      { ...base, targetId: 't-2', targetName: 'NGC 7000' }
    ], { hasNarrowbandFilter: true })
    expect(plan.choices.find(c => c.targetId === 't-1')?.filter?.filter).toBe('OIII')
    expect(plan.choices.find(c => c.targetId === 't-2')?.filter).toBeNull()
  })
})
