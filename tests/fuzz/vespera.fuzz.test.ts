import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { classifyFile, parseDestinationFolder, parseRunFolder, parseSessionFolder, recordSessionId, targetFromObservationJson, targetInText } from '@astro/domain'
import { fitsHeaderObject, jpegImageDescription } from '../../src/main/adapters/vespera-metadata'
import { fitsWithObject, jpegWithDescription } from '../helpers/vespera-bytes'
import { FUZZ_TEST_TIMEOUT_MS, fuzzParams, mutatedBytes, mutatedText, textish, withinBudget } from './fuzz-config'

const NAMES = ['2024-06-15_21-00-54_observation_NGC3372', '2024-06-16_01-12-12_observation_M8_M20_10_18', '01-observation-eagle-15-15', '04-images-adjust-framing', 'img-0042-output.jpg', 'M31_2026-10-14_FIT=400_TIF=1_2']
const JSON_SEEDS = ['{"target":"M 31"}', '{"target":{"name":"IC 443"}}', '{"sessionId":"2024-06-15_21-00-54_observation_NGC3372","files":[]}', '[]']

const wellFormed = (s: string | null) => s === null || (typeof s === 'string' && s.trim() === s && s !== '')

describe('Vespera ingest fuzz', () => {
  it('[FUZ-001, FUZ-003, VIN-005] Given any folder or file name, When the name parsers read it, Then each returns its documented shape or null, never throws, in budget', () => {
    fc.assert(
      fc.property(fc.oneof(textish(120), mutatedText(NAMES, ['_', '-', '=', '.', '0', 'observation', 'images', 'FIT', 'img-'])), name => {
        withinBudget('vespera names', () => {
          const s = parseSessionFolder(name)
          if (s) expect(s.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
          const r = parseRunFolder(name)
          expect(['pointing', 'images', 'unknown']).toContain(r.stage)
          const f = classifyFile({ name, sizeBytes: 1, modifiedAt: null })
          expect(['fits', 'tiff', 'jpeg', 'json', 'other']).toContain(f.kind)
          if (f.frameNo !== undefined) expect(Number.isInteger(f.frameNo) && f.frameNo >= 0 && f.frameNo <= 9999).toBe(true)
          const d = parseDestinationFolder(name)
          if (d) for (const v of Object.values(d.counts)) expect(Number.isFinite(v)).toBe(true)
        })
      }),
      fuzzParams()
    )
  }, FUZZ_TEST_TIMEOUT_MS)

  it('[FUZ-001, FUZ-004, VIN-011] Given any observation.json or record text, When read, Then a trimmed name, an id or null comes back and nothing is thrown', () => {
    fc.assert(
      fc.property(fc.oneof(textish(200), mutatedText(JSON_SEEDS, ['{', '}', '"', ':', ',', '[', ']', '__proto__', 'constructor', 'target', 'null'])), text => {
        withinBudget('observation json', () => {
          expect(wellFormed(targetFromObservationJson(text))).toBe(true)
          const id = recordSessionId(text)
          expect(id === null || typeof id === 'string').toBe(true)
          const t = targetInText(text)
          if (t) expect(t.name).toMatch(/^(M|NGC|IC|Sh2) \d+$/)
        })
      }),
      fuzzParams()
    )
  }, FUZZ_TEST_TIMEOUT_MS)

  it('[FUZ-002, FUZ-003, VIN-010, VIN-011] Given mutated JPEG and FITS heads, When their name is read, Then text or null comes back, never an error', () => {
    const seeds = [Buffer.from(jpegWithDescription('M 42 - 120 frames')), Buffer.from(jpegWithDescription('NGC 7000', true)), Buffer.from(fitsWithObject('IC 443')), Buffer.from(jpegWithDescription(null))]
    fc.assert(
      fc.property(fc.oneof(mutatedBytes(seeds, () => 120), fc.uint8Array({ maxLength: 300 })), bytes => {
        withinBudget('vespera metadata', () => {
          expect(wellFormed(jpegImageDescription(bytes))).toBe(true)
          expect(wellFormed(fitsHeaderObject(bytes))).toBe(true)
        })
      }),
      fuzzParams()
    )
  }, FUZZ_TEST_TIMEOUT_MS)
})
