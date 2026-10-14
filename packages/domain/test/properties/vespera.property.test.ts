import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  copyPace,
  localName,
  observationOf,
  parseObservationName,
  partsKey,
  planCopies,
  plannedFiles,
  readFtpReplies,
  type FtpReply,
  type LandingSizes
} from '@astro/domain'
import { anyText, fileStem, propertyParams } from './arbitraries'

/** A reply as a server would write it: one line, or several with the code and a dash before the last. */
const reply = fc.record({
  code: fc.integer({ min: 100, max: 599 }),
  lines: fc.array(fc.string({ unit: fc.constantFrom(...'abc XYZ 012:.()|-'.split('')), maxLength: 20 }).filter(l => !/^\d{3}/.test(l)), { minLength: 1, maxLength: 4 })
})
const wire = (r: { code: number; lines: string[] }) =>
  r.lines.length === 1
    ? `${r.code} ${r.lines[0]}\r\n`
    : r.lines.map((l, i) => (i === 0 ? `${r.code}-${l}` : i === r.lines.length - 1 ? `${r.code} ${l}` : l)).join('\r\n') + '\r\n'

describe('FTP replies under any split', () => {
  it('[VSP-001, FUZ-006] Given replies cut into reads at any points, When read one read at a time, Then the same replies come back in order', () => {
    fc.assert(
      fc.property(fc.array(reply, { minLength: 1, maxLength: 6 }), fc.array(fc.nat(), { maxLength: 8 }), (replies, cuts) => {
        const text = replies.map(wire).join('')
        const at = [...new Set(cuts.map(c => c % (text.length + 1)))].sort((a, b) => a - b)
        const pieces = [...at, text.length].map((end, i) => text.slice(i === 0 ? 0 : at[i - 1], end))
        const got: FtpReply[] = []
        let rest = ''
        for (const piece of pieces) {
          const out = readFtpReplies(rest + piece)
          got.push(...out.replies)
          rest = out.rest
        }
        expect(rest).toBe('')
        expect(got).toEqual(replies.map(r => ({ code: r.code, text: r.lines.join('\n') })))
      }),
      propertyParams()
    )
  })
})

describe('landing names', () => {
  it('[VSP-013, FUZ-006] Given any name, When made safe for Windows, Then it is never empty, holds no reserved character, and making it safe again changes nothing', () => {
    fc.assert(
      fc.property(anyText, name => {
        const safe = localName(name)
        expect(safe.length).toBeGreaterThan(0)
        // eslint-disable-next-line no-control-regex
        expect(safe).not.toMatch(/[<>:"/\\|?*\u0000-\u001f]|[. ]$/)
        expect(['.', '..']).not.toContain(safe)
        expect(localName(safe)).toBe(safe)
      }),
      propertyParams()
    )
  })
})

describe('copy plans', () => {
  const files = fc.array(
    fc.record({ dir: fc.constantFrom('01-images-initial', '02-images-adjust-framing', ''), name: fileStem, ext: fc.constantFrom('.fits', '.FIT', '.json', '.jpeg', '.tif'), size: fc.option(fc.nat({ max: 5000 })) }),
    { maxLength: 20 }
  )

  it('[VSP-004, VSP-006, FUZ-006] Given any observation and anything already on the PC, When planned, Then copies and skips split the files, no two copies land in one place, nothing on the PC is copied over, and the bytes add up', () => {
    fc.assert(
      fc.property(files, fc.array(fc.tuple(fc.nat(), fc.option(fc.nat({ max: 5000 }))), { maxLength: 10 }), (list, present) => {
        const obs = observationOf('observation', '/user', 'obs', list.map(f => {
          const relative = f.dir ? `${f.dir}/${f.name}${f.ext}` : `${f.name}${f.ext}`
          return { relative, entry: { name: `${f.name}${f.ext}`, kind: 'file' as const, sizeBytes: f.size } }
        }))
        const planned = plannedFiles([obs], [{ folder: 'obs', kind: 'observation' }], ['fits', 'json', 'jpeg', 'tiff'])
        const have: LandingSizes = new Map()
        for (const [i, size] of present) if (planned.length > 0) have.set(partsKey(planned[i % planned.length].parts), size)
        const plan = planCopies(planned, have)
        expect(plan.copies.length + plan.skipped.length).toBe(planned.length)
        const keys = plan.copies.map(c => partsKey(c.parts).toLowerCase())
        expect(new Set(keys).size).toBe(keys.length)
        expect(plan.copies.every(c => (have.get(partsKey(c.parts)) ?? null) === null)).toBe(true)
        expect(plan.bytes).toBe(plan.copies.reduce((n, c) => n + (c.sizeBytes ?? 0), 0))
      }),
      propertyParams()
    )
  })
})

describe('observation names', () => {
  it('[VSP-015, FUZ-006] Given any folder name, When read, Then the time is a real one or null and the target is trimmed text or null', () => {
    fc.assert(
      fc.property(anyText, name => {
        const out = parseObservationName(name)
        if (out.takenAt !== null) {
          expect(out.takenAt).toMatch(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/)
          expect(Number.isNaN(new Date(`${out.takenAt.slice(0, 10)}T00:00:00Z`).getTime())).toBe(false)
        }
        if (out.target !== null) expect(out.target).toBe(out.target.trim())
        if (out.target !== null) expect(out.target.length).toBeGreaterThan(0)
      }),
      propertyParams()
    )
  })
})

describe('copy pace', () => {
  it('[VSP-011, FUZ-006] Given a copy at a steady speed, When more is done, Then the fraction never falls and the time left never rises', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 ** 9 }), fc.integer({ min: 1, max: 10 ** 6 }), fc.nat(), fc.nat(), (total, rate, a, b) => {
        const [t1, t2] = [1 + (a % 3600), 1 + (b % 3600)].sort((x, y) => x - y)
        const p1 = copyPace(Math.min(total, rate * t1), total, t1 * 1000)
        const p2 = copyPace(Math.min(total, rate * t2), total, t2 * 1000)
        expect(p1.fraction).toBeGreaterThanOrEqual(0)
        expect(p2.fraction).toBeLessThanOrEqual(1)
        expect(p2.fraction).toBeGreaterThanOrEqual(p1.fraction)
        expect(p2.remainingSeconds!).toBeLessThanOrEqual(p1.remainingSeconds!)
      }),
      propertyParams()
    )
  })
})
