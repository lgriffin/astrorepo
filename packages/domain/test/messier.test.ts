import { describe, expect, it } from 'vitest'
import {
  MESSIER_COLUMNS,
  MESSIER_COUNT,
  MESSIER_FILTERS,
  MESSIER_GAPS_IN_NEXT_ACTIONS,
  MESSIER_STATES,
  PROGRESS_STATES,
  compareOutlooks,
  messierGapsTonight,
  messierNumber,
  messierOutlook,
  messierState,
  messierSummary,
  orderPictures,
  pictureFormat,
  showsUnder,
  type MessierOutlook,
  type MessierState,
  type PictureCandidate
} from '@astro/domain'

const at = (iso: string) => new Date(iso)
const finished = (path: string, modified = '2026-01-01T00:00:00Z'): PictureCandidate => ({ path, kind: 'finished', colour: null, modifiedAt: at(modified) })
const master = (path: string, colour: boolean | null, modified = '2026-01-01T00:00:00Z'): PictureCandidate => ({ path, kind: 'master', colour, modifiedAt: at(modified) })

const tonight = (hours: number, closesInDays: number | null = null, moonSeparationDeg: number | null = null): MessierOutlook => ({ kind: 'tonight', hours, moonSeparationDeg, closesInDays })
const later = (fromMonth: string, bestMonth = fromMonth): MessierOutlook => ({ kind: 'later', fromMonth, bestMonth })

describe('Messier numbers', () => {
  it('[MES-001] Given the catalogue, When counted, Then it has 110 objects in ten rows of eleven', () => {
    expect(MESSIER_COUNT).toBe(110)
    expect(MESSIER_COLUMNS).toBe(11)
    expect(MESSIER_COUNT / MESSIER_COLUMNS).toBe(10)
  })

  it.each([
    ['M31', 31],
    ['M 31', 31],
    [' m031 ', 31],
    ['M1', 1],
    ['M110', 110]
  ])('[MES-001] Given the designation %j, When read, Then it is Messier %i', (designation, n) => {
    expect(messierNumber(designation)).toBe(n)
  })

  it.each(['M0', 'M111', 'M', 'NGC 224', 'M31a', 'XM31', 'M 1 2', '', 'M1000'])('[MES-001] Given %j, When read, Then it is no Messier number', designation => {
    expect(messierNumber(designation)).toBeNull()
  })
})

describe('A tile’s state', () => {
  it.each([
    ['final', 'imaged'],
    ['processed', 'stacked'],
    ['stacked', 'stacked'],
    ['capturing', 'captured'],
    ['enough-data', 'captured'],
    ['planned', 'gap']
  ] as const)('[MES-002] Given a target %s, When placed on the mosaic, Then its tile is %s', (progress, state) => {
    expect(messierState(progress)).toBe(state)
  })

  it('[MES-002] Given a target the index knows nothing about, When placed, Then its tile is a gap, and every progress state maps to a tile state', () => {
    expect(messierState(null)).toBe('gap')
    for (const p of PROGRESS_STATES) expect(MESSIER_STATES).toContain(messierState(p))
  })
})

describe('Choosing a tile’s picture', () => {
  it.each([
    ['a/b/final.JPG', 'jpeg'],
    ['final.jpeg', 'jpeg'],
    ['final.png', 'png'],
    ['C:\\img\\final.TIF', 'tiff'],
    ['final.tiff', 'tiff'],
    ['m.fit', 'fits'],
    ['m.FITS', 'fits'],
    ['m.fts', 'fits'],
    ['notes.txt', null],
    ['no-extension', null],
    ['folder.png/file', null]
  ])('[MES-003] Given %j, When its format is read from its name, Then it is %j', (path, format) => {
    expect(pictureFormat(path)).toBe(format)
  })

  it('[MES-003] Given finished images of every format and masters, When ordered, Then JPEG and PNG come first, then TIFF, FITS, colour masters, other masters', () => {
    const order = orderPictures([
      master('mono.fit', false),
      master('unknown.fit', null),
      finished('final.fits'),
      master('rgb.fit', true),
      finished('final.tif'),
      finished('final.png'),
      finished('notes.txt'),
      master('master.png', true)
    ])
    expect(order.map(p => p.path)).toEqual(['final.png', 'final.tif', 'final.fits', 'rgb.fit', 'mono.fit', 'unknown.fit'])
  })

  it('[MES-003] Given several of one rank, When ordered, Then the newest comes first, an unknown time last, and a tie goes by path', () => {
    const order = orderPictures([
      finished('old.jpg', '2025-01-01T00:00:00Z'),
      { ...finished('unknown.jpg'), modifiedAt: null },
      finished('new.png', '2026-06-01T00:00:00Z'),
      finished('b.jpg', '2025-06-01T00:00:00Z'),
      finished('a.jpg', '2025-06-01T00:00:00Z')
    ])
    expect(order.map(p => p.path)).toEqual(['new.png', 'a.jpg', 'b.jpg', 'old.jpg', 'unknown.jpg'])
  })

  it('[MES-003] Given only files the mosaic cannot draw, When ordered, Then nothing is left', () => {
    expect(orderPictures([finished('notes.txt'), master('stack.tif', true)])).toEqual([])
  })
})

describe('When an object can be shot', () => {
  const months = (...hours: number[]) => hours.map((h, i) => ({ month: `2026-${String(i + 10).padStart(2, '0')}`, hoursPerNight: h }))

  it('[MES-005] Given an object up for an hour tonight, When its outlook is worked out, Then it is up tonight with the moon and its closing season', () => {
    expect(messierOutlook({ tonight: { hours: 1, moonSeparationDeg: 40, moonBlocks: false }, closing: { daysLeft: 9 }, months: [] })).toEqual(tonight(1, 9, 40))
    expect(messierOutlook({ tonight: { hours: 3.5, moonSeparationDeg: null, moonBlocks: false }, closing: null, months: [] })).toEqual(tonight(3.5, null, null))
  })

  it('[MES-005] Given an object up tonight but ruled out by a bright moon, When worked out, Then it says the moon holds it back', () => {
    expect(messierOutlook({ tonight: { hours: 4, moonSeparationDeg: 20, moonBlocks: true }, closing: null, months: [] })).toEqual({ kind: 'moon', hours: 4 })
  })

  it('[MES-005] Given an object under an hour tonight, When worked out, Then it is in season from the first month with an hour a night, best in the month with the most', () => {
    expect(messierOutlook({ tonight: { hours: 0.99, moonSeparationDeg: null, moonBlocks: false }, closing: null, months: months(0, 0.5, 1, 3, 2) })).toEqual(later('2026-12', '2026-13'))
    expect(messierOutlook({ tonight: null, closing: null, months: months(0, 2, 2) })).toEqual(later('2026-11', '2026-11'))
  })

  it('[MES-005] Given an object that never offers an hour a night, When worked out, Then it is never in season from the site', () => {
    expect(messierOutlook({ tonight: { hours: 0.5, moonSeparationDeg: null, moonBlocks: true }, closing: null, months: months(0.9, 0.2) })).toEqual({ kind: 'never' })
    expect(messierOutlook({ tonight: null, closing: null, months: [] })).toEqual({ kind: 'never' })
  })

  it('[MES-005] Given a stricter policy, When worked out, Then its minimum usable hours decide', () => {
    const policy = { minAltitudeDeg: 30, minUsableHours: 2, closingWithinDays: 30, brightMoonIllumination: 0.6, newMoonHalfWidthDays: 3 }
    expect(messierOutlook({ tonight: { hours: 1.5, moonSeparationDeg: null, moonBlocks: false }, closing: null, months: months(1.5, 2) }, policy)).toEqual(later('2026-11'))
  })
})

describe('Which gap comes first', () => {
  const sort = (rows: { number: number; outlook: MessierOutlook | null }[]) => [...rows].sort(compareOutlooks).map(r => r.number)

  it('[MES-008] Given outlooks of every kind, When ordered, Then up tonight leads, then moon-held, then later, then never, then unknown', () => {
    expect(
      sort([
        { number: 1, outlook: null },
        { number: 2, outlook: { kind: 'never' } },
        { number: 3, outlook: later('2027-01') },
        { number: 4, outlook: { kind: 'moon', hours: 5 } },
        { number: 5, outlook: tonight(1) }
      ])
    ).toEqual([5, 4, 3, 2, 1])
  })

  it('[MES-008] Given objects up tonight, When ordered, Then closing seasons come soonest first, then the most hours, then by number', () => {
    expect(
      sort([
        { number: 10, outlook: tonight(6) },
        { number: 11, outlook: tonight(2, 20) },
        { number: 12, outlook: tonight(3, 5) },
        { number: 13, outlook: tonight(8) },
        { number: 9, outlook: tonight(6) }
      ])
    ).toEqual([12, 11, 13, 9, 10])
  })

  it('[MES-008] Given moon-held and later objects, When ordered, Then the most hours and the earliest month come first, then by number', () => {
    expect(
      sort([
        { number: 20, outlook: { kind: 'moon', hours: 2 } },
        { number: 21, outlook: { kind: 'moon', hours: 4 } },
        { number: 22, outlook: { kind: 'moon', hours: 2 } }
      ])
    ).toEqual([21, 20, 22])
    expect(
      sort([
        { number: 30, outlook: later('2027-03') },
        { number: 31, outlook: later('2026-12') },
        { number: 29, outlook: later('2027-03') },
        { number: 28, outlook: { kind: 'never' } },
        { number: 27, outlook: { kind: 'never' } }
      ])
    ).toEqual([31, 29, 30, 27, 28])
  })
})

describe('The counts and filters', () => {
  const tile = (state: MessierState, outlook: MessierOutlook | null = null) => ({ state, outlook })

  it('[MES-001] Given tiles in every state, When counted, Then each state is counted out of 110, and missing objects up tonight are the ones not imaged', () => {
    expect(
      messierSummary([tile('imaged', tonight(3)), tile('imaged'), tile('stacked', tonight(2)), tile('captured', { kind: 'moon', hours: 3 }), tile('gap', tonight(1)), tile('gap', later('2027-01')), tile('gap')])
    ).toEqual({ total: 110, imaged: 2, stacked: 1, captured: 1, gaps: 3, missingUpTonight: 2 })
  })

  it('[MES-006] Given each filter, When a tile is checked, Then all shows everything, not imaged and not captured follow the state, and up tonight needs both', () => {
    expect(MESSIER_FILTERS).toEqual(['all', 'missing', 'gaps', 'tonight'])
    const rows: [ReturnType<typeof tile>, boolean[]][] = [
      [tile('imaged', tonight(4)), [true, false, false, false]],
      [tile('stacked', tonight(4)), [true, true, false, true]],
      [tile('captured', { kind: 'moon', hours: 4 }), [true, true, false, false]],
      [tile('gap', tonight(1)), [true, true, true, true]],
      [tile('gap', null), [true, true, true, false]]
    ]
    for (const [t, expected] of rows) expect(MESSIER_FILTERS.map(f => showsUnder(f, t))).toEqual(expected)
  })
})

describe('Messier gaps for Next actions', () => {
  const row = (number: number, state: MessierState, outlook: MessierOutlook | null) => ({ number, designation: `M${number}`, targetId: `m${number}`, targetName: `M${number}`, state, outlook })

  it('[MES-008] Given objects in every state and outlook, When the gaps for tonight are picked, Then only uncaptured objects up tonight come, best first, at most three', () => {
    expect(MESSIER_GAPS_IN_NEXT_ACTIONS).toBe(3)
    const gaps = messierGapsTonight([
      row(1, 'gap', tonight(2)),
      row(2, 'captured', tonight(9)),
      row(3, 'gap', { kind: 'moon', hours: 9 }),
      row(4, 'gap', tonight(5, null, 30)),
      row(5, 'gap', tonight(1, 4)),
      row(6, 'gap', later('2027-01')),
      row(7, 'gap', tonight(3)),
      row(8, 'imaged', tonight(9)),
      row(9, 'gap', null)
    ])
    expect(gaps).toEqual([
      { number: 5, designation: 'M5', targetId: 'm5', targetName: 'M5', usableHours: 1, moonSeparationDeg: null, closesInDays: 4 },
      { number: 4, designation: 'M4', targetId: 'm4', targetName: 'M4', usableHours: 5, moonSeparationDeg: 30, closesInDays: null },
      { number: 7, designation: 'M7', targetId: 'm7', targetName: 'M7', usableHours: 3, moonSeparationDeg: null, closesInDays: null }
    ])
  })

  it('[MES-008] Given a limit, When picked, Then no more than it come, and none for a limit of zero or less', () => {
    const rows = [row(1, 'gap', tonight(2)), row(2, 'gap', tonight(3))]
    expect(messierGapsTonight(rows, 1).map(g => g.number)).toEqual([2])
    expect(messierGapsTonight(rows, 5).map(g => g.number)).toEqual([2, 1])
    expect(messierGapsTonight(rows, 0)).toEqual([])
    expect(messierGapsTonight(rows, -1)).toEqual([])
  })
})
