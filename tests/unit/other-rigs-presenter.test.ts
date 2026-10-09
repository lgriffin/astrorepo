import { describe, expect, it } from 'vitest'
import type { CometPlan, ScriptEstimate, SirilRunEstimate } from '@astro/application'
import type { FilterSuggestion, NextAction, TonightPlan } from '@astro/domain'
import { stackAdvice } from '@astro/testkit'
import { rawNote, toFilterPlanView, toSirilPlanView } from '../../src/main/adapters/siril-plan-presenter'
import { formatDec, formatRa, orbitText, toCometPlanView } from '../../src/main/adapters/comet-presenter'
import { captureFilter, filterLine, toNextActionRecommendation } from '../../src/main/adapters/stacking-suggestion-presenter'
import { toForwardPlanView } from '../../src/main/adapters/planning-presenter'

const GB = 1024 ** 3

const mono = (over: Partial<ScriptEstimate> = {}): ScriptEstimate => ({
  script: 'Mono_Preprocessing',
  label: 'Mono, with biases, flats and darks',
  missing: [],
  scriptBytes: 10 * GB,
  stages: [],
  neededBytes: 10 * GB,
  fits: true,
  headroomBytes: 90 * GB,
  shortBytes: null,
  memory: null,
  ...over
})

const filters = (): NonNullable<SirilRunEstimate['filters']> => ({
  darks: 20,
  biases: 1,
  unfilteredLights: 2,
  unfilteredFlats: 1,
  flatsMissing: ['SII'],
  stacks: [
    { filter: 'Ha', workDir: '/work/NGC 6888/filters/Ha', counts: { lights: 40, flats: 15, darks: 20, biases: 1 }, rejectedLights: 3, script: mono(), master: { path: '/work/NGC 6888/filters/Ha/result_12000s.fit', sizeBytes: 1, modifiedAt: null } },
    { filter: 'SII', workDir: '/work/NGC 6888/filters/SII', counts: { lights: 20, flats: 0, darks: 20, biases: 1 }, rejectedLights: 0, script: mono({ missing: ['flats'] }), master: null }
  ]
})

const estimate = (over: Partial<SirilRunEstimate> = {}): SirilRunEstimate => ({
  counts: { lights: 60, darks: 20, flats: 15, biases: 1 },
  rejectedLights: 0,
  sensor: 'mono',
  sensorKnown: true,
  geometry: { width: 6248, height: 4176 },
  geometryApproximate: false,
  geometryMixed: false,
  prepBytes: 0,
  freeBytes: 100 * GB,
  usedBytes: 0,
  recommended: { script: 'Mono_Preprocessing', reason: 'Mono frames with biases, flats and darks.' },
  scripts: [mono()],
  advice: stackAdvice(),
  ...over
})

describe('camera RAW in the plan', () => {
  it('[RIG-004] Given RAW lights, some not indexed, When presented, Then the plan says the colour script reads them and which are not indexed', () => {
    expect(rawNote({ count: 3, unread: 1, formats: ['CR2', 'CR3'] })).toBe(
      "3 lights are camera RAW (CR2 and CR3). Siril's colour scripts read RAW in their convert step and debayer it, so the colour script above stacks them as they are. 1 light is not indexed (CR3 and RAF metadata is not read), so its settings and size are unknown."
    )
    expect(rawNote({ count: 1, unread: 0, formats: ['NEF'] })).toBe("1 light is camera RAW (NEF). Siril's colour scripts read RAW in their convert step and debayer it, so the colour script above stacks them as they are.")
  })

  it('[RIG-016] Given FITS lights from one filter, When presented, Then there is no RAW note and no per-filter plan', () => {
    const view = toSirilPlanView(estimate())
    expect(view.rawNote).toBeNull()
    expect(view.filters).toBeNull()
    expect(view.scripts[0].canQueue).toBe(true)
  })
})

describe('the per-filter plan', () => {
  it('[RIG-006] [RIG-008] [RIG-018] Given mono lights in two filters, When presented, Then each filter is a row and the stack of them all cannot be queued', () => {
    const view = toSirilPlanView(estimate({ filters: filters() }))
    expect(view.scripts[0].canQueue).toBe(false)
    expect(view.filters?.intro).toBe("These mono lights carry 2 filters. Siril's mono script stacks one filter at a time, so each filter is laid out in its own work folder with its own flats and the shared 20 darks and 1 bias.")
    expect(view.filters?.notes).toEqual([
      "2 lights record no filter, so no filter's stack takes them.",
      "1 flat records no filter, so no filter's stack takes it.",
      'No flats taken with SII: Siril\'s mono script needs flats from the same filter, because dust and vignetting change with it.'
    ])
    expect(view.filters?.stacks[0]).toEqual({
      filter: 'Ha',
      workDir: '/work/NGC 6888/filters/Ha',
      frames: '40 lights, 15 flats, 20 darks, 1 bias; 3 lights rejected by grading left out',
      needed: '10.0 GB',
      verdict: 'fits',
      verdictText: 'Fits, 90.0 GB to spare',
      missing: null,
      canQueue: true,
      master: 'result_12000s.fit'
    })
    expect(view.filters?.stacks[1]).toMatchObject({ missing: 'Needs flats for this filter, which this folder does not have.', canQueue: false, master: null })
  })

  it('[RIG-007] Given channel masters for some, all or none of the filters, When presented, Then the note says what is left to do', () => {
    const f = filters()
    expect(toFilterPlanView(f, 100 * GB).mastersNote).toBe("1 of 2 channels has a master. Stack the rest, then combine them in Siril's RGB composition.")
    f.stacks[1].master = { path: 'C:\\work\\filters\\SII\\result_6000s.fit', sizeBytes: 1, modifiedAt: null }
    const all = toFilterPlanView(f, 100 * GB)
    expect(all.mastersNote).toBe("Every channel has a master. Combine them in Siril's RGB composition.")
    expect(all.stacks[1].master).toBe('result_6000s.fit')
    f.stacks.forEach(s => (s.master = null))
    expect(toFilterPlanView(f, null)).toMatchObject({ mastersNote: "Each finished stack leaves its channel master in its filter's work folder, listed here." })
    expect(toFilterPlanView(f, null).stacks[0]).toMatchObject({ verdict: 'unknown', canQueue: false })
    expect(toFilterPlanView({ ...f, stacks: [{ ...f.stacks[0], script: mono({ fits: false, shortBytes: 2 * GB, headroomBytes: null }) }] }, GB).stacks[0]).toMatchObject({ verdict: 'short', verdictText: 'Short by 2.0 GB' })
  })
})

describe('the filter for tonight', () => {
  const suggestion = (over: Partial<FilterSuggestion> = {}): FilterSuggestion => ({ filter: 'OIII', family: 'narrowband', brightMoon: true, suitsMoon: true, haveSec: 2400, lag: { filter: 'OIII', haveSec: 2400, leadFilter: 'Ha', leadSec: 21600 }, ...over })

  it('[RIG-010] Given filter suggestions, When worded, Then the moon\'s reason leads when it applies and the lag or the least captured follows', () => {
    expect(filterLine(suggestion())).toBe('Narrowband while the moon is bright: capture OIII, it has 40 m against 6 h of Ha.')
    expect(filterLine(suggestion({ filter: 'R', family: 'broadband', brightMoon: false, lag: null, haveSec: 0 }))).toBe('Broadband while the moon is dark: capture R, it has the least so far (nothing yet).')
    expect(filterLine(suggestion({ suitsMoon: false, brightMoon: false }))).toBe('Capture OIII: it has 40 m against 6 h of Ha.')
    expect(captureFilter({ filter: null, channel: null })).toBeNull()
    expect(captureFilter({ channel: { filter: 'SII', haveSec: 0, leadFilter: 'Ha', leadSec: 3600 } })?.name).toBe('SII')
  })

  it('[RIG-010] Given a capture with a filter suggestion, When shown on Home and in tonight\'s plan, Then the title and the line name that filter', () => {
    const action: NextAction = { kind: 'capture', id: 'capture:t:2026-09-29', targetId: 't', targetName: 'NGC 6888', night: '2026-09-29', usableHours: 5, moonSeparationDeg: 60, closesInDays: null, shortOfGoalSec: null, channel: { filter: 'OIII', haveSec: 2400, leadFilter: 'Ha', leadSec: 21600 }, filter: suggestion() }
    const rec = toNextActionRecommendation(action)
    expect(rec.title).toBe('NGC 6888 · shoot tonight in OIII, 5 h above 30°')
    expect(rec.description).toContain('Narrowband while the moon is bright: capture OIII')
    expect(rec.description).not.toContain('Capture OIII: it has')
    const tonight: TonightPlan = { night: '2026-09-29', darkStart: new Date(), darkEnd: new Date(), darkness: 'astronomical', moonIllumination: 0.9, moonUp: true, brightMoon: true, noFilterForBrightMoon: false, choices: [{ targetId: 't', targetName: 'NGC 6888', usableHours: 5, moonSeparationDeg: 60, shortOfGoalSec: null, channel: null, filter: suggestion() }] }
    const view = toForwardPlanView({ status: 'ok', site: { latitudeDeg: 51.5, longitudeDeg: 0, elevationM: 0 }, tonight, closing: [], windows: [], seasons: [] })
    expect(view.status === 'ok' && view.tonight?.choices[0].detail).toBe('5 h above 30°, moon 60° away. Narrowband while the moon is bright: capture OIII, it has 40 m against 6 h of Ha.')
  })
})

describe('the comet plan', () => {
  const orbit = { name: '2P/Encke', perihelionAt: new Date(Date.UTC(1990, 9, 28) + 0.54502 * 86_400_000), q: 0.330886, e: 0.85022, inclinationDeg: 11.94524, nodeDeg: 334.75006, periDeg: 186.23352, epoch: '1990-10-06' }
  const at = (h: number) => new Date(Date.UTC(1990, 9, 6, h))
  const comet = (over: Partial<Extract<CometPlan, { status: 'comet' }>> = {}): CometPlan => ({
    status: 'comet',
    orbit,
    positions: Array.from({ length: 8 }, (_, i) => ({ frame: `Light_00${i + 1}.fit`, at: at(i), raDeg: 158.5587 + i * 0.01, decDeg: 19.1584 - i * 0.002, distanceAu: 0.82 })),
    undated: 2,
    motion: { arcsecPerHour: 34.6, positionAngleDeg: 101.4, spanHours: 7, arcsec: 242.2 },
    fromSite: false,
    file: '/work/2P/comet_positions.csv',
    written: false,
    ...over
  })

  it('[RIG-013] Given sky positions, When formatted, Then RA reads in hours and Dec in degrees with signs', () => {
    expect(formatRa(158.55867)).toBe('10h 34m 14.1s')
    expect(formatRa(-0.0001)).toBe('00h 00m 00.0s')
    expect(formatDec(19.158426)).toBe('+19° 09′ 30″')
    expect(formatDec(-5.5)).toBe('−05° 30′ 00″')
    expect(orbitText(orbit)).toBe('Perihelion 1990-10-28.5450 TT at q 0.330886 AU, e 0.85022 (elliptic), i 11.94524°, node 334.75006°, argument of perihelion 186.23352°; elements for 1990-10-06.')
    expect(orbitText({ ...orbit, e: 1, epoch: null })).toContain('(parabolic)')
    expect(orbitText({ ...orbit, e: 1.0001 })).toContain('(hyperbolic)')
  })

  it('[RIG-014] [RIG-015] Given a comet with positions, When presented, Then the first and last three show, the motion and step are given and the undated lights are counted', () => {
    const view = toCometPlanView(comet())
    expect(view.show).toBe(true)
    expect(view.count).toBe(8)
    expect(view.positions.map(p => p.frame)).toEqual(['Light_001.fit', 'Light_002.fit', 'Light_003.fit', 'Light_006.fit', 'Light_007.fit', 'Light_008.fit'])
    expect(view.positions[0]).toEqual({ frame: 'Light_001.fit', time: '1990-10-06 00:00:00', ra: '10h 34m 14.1s', dec: '+19° 09′ 30″' })
    expect(view.motion).toBe('The comet moves 34.6″ an hour towards position angle 101° (north through east): 242″ over the 7.0 h of lights.')
    expect(view.undatedNote).toBe('2 lights record no capture time, so they have no position and are left out of the positions file.')
    expect(view.step).toContain("Siril's comet registration")
    expect(view.step).toContain('comet_positions.csv')
    expect(view.observerNote).toContain("Earth's centre")
    expect(view.canWrite).toBe(true)
    expect(view.writtenNote).toBeNull()
    const written = toCometPlanView(comet({ written: true, fromSite: true, undated: 1 }))
    expect(written.writtenNote).toBe('Wrote comet_positions.csv with 8 positions to the work folder.')
    expect(written.observerNote).toBe('Positions are astrometric J2000, at mid-exposure, as seen from your site.')
    expect(written.undatedNote).toBe('1 light records no capture time, so it has no position and is left out of the positions file.')
  })

  it('[RIG-016] Given a target that is not a comet, or a comet with no orbit yet, When presented, Then nothing shows, or only the place to paste the orbit', () => {
    expect(toCometPlanView({ status: 'not-comet' }).show).toBe(false)
    const empty = toCometPlanView(comet({ orbit: null, positions: [], undated: 0, motion: null, file: null }))
    expect(empty).toMatchObject({ show: true, orbit: null, count: 0, step: null, canWrite: false, observerNote: null, motion: null, undatedNote: null })
  })
})
