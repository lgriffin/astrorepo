import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { cometMotion, cometPositionsCsv, midExposure, parseMpcComet, type CometFramePosition } from '@astro/domain'
import { anyText, instant, propertyParams } from './arbitraries'

/** Reads CSV as spreadsheets do: quoted fields may hold commas, quotes and line breaks; a row ends at \n, \r\n or a lone \r. */
function readCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  if (field !== '' || row.length > 0) rows.push([...row, field])
  return rows
}

const position: fc.Arbitrary<CometFramePosition> = fc.record({
  frame: fc.oneof(anyText, fc.constantFrom('Light_001.fit', 'a,b.fit', 'say "hi".fit', 'two\nlines.fit', 'cr\r.fit', 'crlf\r\n.fit')),
  at: instant,
  raDeg: fc.double({ min: 0, max: 359.999999, noNaN: true }),
  decDeg: fc.double({ min: -90, max: 90, noNaN: true })
})

describe('the comet positions file', () => {
  it('[RIG-014, FUZ-006] Given any lights, When the positions file is written and read back as CSV, Then there is a header and one row per light in time order, each frame name exactly as given', () => {
    fc.assert(
      fc.property(fc.array(position, { maxLength: 20 }), rows => {
        const parsed = readCsv(cometPositionsCsv(rows))
        expect(parsed[0]).toEqual(['frame', 'date_utc', 'ra_deg', 'dec_deg'])
        const body = parsed.slice(1)
        expect(body).toHaveLength(rows.length)
        const times = body.map(r => new Date(r[1]).getTime())
        expect(times).toEqual([...times].sort((a, b) => a - b))
        expect(body.map(r => r[0]).sort()).toEqual(rows.map(r => r.frame).sort())
        for (const r of body) {
          expect(r).toHaveLength(4)
          expect(Number(r[2])).toBeGreaterThanOrEqual(0)
          expect(Math.abs(Number(r[3]))).toBeLessThanOrEqual(90)
        }
      }),
      propertyParams()
    )
  })

  it('[RIG-013, RIG-014, FUZ-006] Given any positions over time, When the comet\'s motion is worked out, Then its rate and distance are not negative and its direction lies in [0, 360)', () => {
    fc.assert(
      fc.property(fc.array(position, { minLength: 2, maxLength: 10 }), points => {
        const m = cometMotion(points)
        if (!m) {
          expect(new Set(points.map(p => p.at.getTime())).size).toBe(1)
          return
        }
        expect(m.arcsec).toBeGreaterThanOrEqual(0)
        expect(m.arcsecPerHour).toBeGreaterThanOrEqual(0)
        expect(m.spanHours).toBeGreaterThan(0)
        expect(m.positionAngleDeg).toBeGreaterThanOrEqual(0)
        expect(m.positionAngleDeg).toBeLessThan(360)
      }),
      propertyParams()
    )
  })

  it('[RIG-013, FUZ-006] Given an exposure of any length, When its middle is found, Then it is half the exposure after the start', () => {
    fc.assert(
      fc.property(instant, fc.option(fc.integer({ min: 0, max: 3600 }), { nil: null }), (start, exposure) => {
        expect(midExposure(start, exposure).getTime() - start.getTime()).toBe(((exposure ?? 0) * 1000) / 2)
      }),
      propertyParams()
    )
  })
})

describe('MPC comet lines', () => {
  const orbit = fc.record({
    year: fc.integer({ min: 1900, max: 2100 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }),
    fraction: fc.integer({ min: 0, max: 9999 }),
    q: fc.integer({ min: 1, max: 999_999 }).map(n => n / 100_000),
    e: fc.integer({ min: 0, max: 1_500_000 }).map(n => n / 1_000_000),
    peri: fc.integer({ min: 0, max: 3_599_999 }).map(n => n / 10_000),
    node: fc.integer({ min: 0, max: 3_599_999 }).map(n => n / 10_000),
    inc: fc.integer({ min: 0, max: 1_799_999 }).map(n => n / 10_000),
    epoch: fc.option(fc.tuple(fc.integer({ min: 1990, max: 2100 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 28 })), { nil: null }),
    name: fc.constantFrom('C/2023 A3 (Tsuchinshan-ATLAS)', '1P/Halley', '12P/Pons-Brooks'),
    indent: fc.boolean()
  })

  it('[RIG-011, FUZ-006] Given any comet\'s elements written as an MPC line, with or without its leading columns, When read, Then the same elements, epoch and name come back', () => {
    fc.assert(
      fc.property(orbit, o => {
        const p2 = (n: number) => String(n).padStart(2, '0')
        const day = `${p2(o.day)}.${String(o.fraction).padStart(4, '0')}`
        const epoch = o.epoch ? ` ${o.epoch[0]}${p2(o.epoch[1])}${p2(o.epoch[2])}` : ''
        const line = `${o.indent ? '0001P         ' : ''}${o.year} ${p2(o.month)} ${day}  ${o.q.toFixed(6)}  ${o.e.toFixed(6)}  ${o.peri.toFixed(4)}  ${o.node.toFixed(4)}  ${o.inc.toFixed(4)}${epoch}  ${o.name}`
        const parsed = parseMpcComet(line)
        expect(parsed.ok).toBe(true)
        if (!parsed.ok) return
        expect(parsed.orbit).toMatchObject({ q: o.q, e: o.e, periDeg: o.peri, nodeDeg: o.node, inclinationDeg: o.inc, name: o.name })
        expect(parsed.orbit.epoch).toBe(o.epoch ? `${o.epoch[0]}-${p2(o.epoch[1])}-${p2(o.epoch[2])}` : null)
        expect(parsed.orbit.perihelionAt.getTime()).toBeCloseTo(Date.UTC(o.year, o.month - 1, o.day) + (o.fraction / 10_000) * 86_400_000, -1)
      }),
      propertyParams()
    )
  })
})
