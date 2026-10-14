import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { copyPace, readFtpReplies, type FtpReply } from '@astro/domain'
import { propertyParams } from './arbitraries'

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
  it('[VIN-001, FUZ-006] Given replies cut into reads at any points, When read one read at a time, Then the same replies come back in order', () => {
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

describe('copy pace', () => {
  it('[VIN-029, FUZ-006] Given a copy at a steady speed, When more is done, Then the fraction never falls and the time left never rises', () => {
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
