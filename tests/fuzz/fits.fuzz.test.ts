import { describe, it } from 'vitest'
import fc from 'fast-check'
import { fitsBytes, fitsImage } from '../helpers/fits'
import { BINARY_CONTRACTS } from './contracts'
import { FUZZ_TEST_TIMEOUT_MS, fuzzParams, mutatedBytes } from './fuzz-config'

const BLOCK = 2880

/** Valid files to mutate: a header alone, 16-bit and float images, three planes, a long header. */
const SEEDS: Buffer[] = [
  fitsBytes({ OBJECT: 'M 42', EXPTIME: 120, FILTER: 'Ha', 'DATE-OBS': '2024-03-10T21:15:03' }),
  fitsImage(4, 3, [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 65535]], { cards: { BAYERPAT: 'RGGB' } }),
  fitsImage(2, 2, [[0.1, 0.2, 0.3, 0.4], [1, 2, 3, 4], [5, 6, 7, 8]], { float: true }),
  fitsImage(3, 1, [[1, 2, 3]], { cards: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`KEY${i}`, `value ${i}`])) })
]

/** Header cards the readers act on, with values that are valid, borderline or nonsense. */
const KEYWORDS = ['SIMPLE', 'BITPIX', 'NAXIS', 'NAXIS1', 'NAXIS2', 'NAXIS3', 'NAXIS4', 'BSCALE', 'BZERO', 'DATAMAX', 'BAYERPAT', 'OBJECT', 'CONTINUE', 'COMMENT', 'HISTORY', 'END', '']
const VALUES = [
  'T', 'F', '0', '1', '2', '3', '4', '8', '16', '32', '-32', '-64', '64', '-1', '7', '1.5', '1E3', '1.0D2', '2147483647', '4294967296',
  '1e308', '-1e308', '1e-320', 'NaN', 'Infinity', "'RGGB'", "'unclosed", "''", "'it''s'", '/ comment', '', '99999999999999999999'
]

const card = fc
  .tuple(fc.constantFrom(...KEYWORDS), fc.constantFrom('= ', '=', '  ', '= '), fc.oneof(fc.constantFrom(...VALUES), fc.string({ maxLength: 20 })), fc.string({ maxLength: 10 }))
  .map(([key, indicator, value, tail]) => `${key.padEnd(8).slice(0, 8)}${indicator}${value.padStart(20)}${tail}`.padEnd(80).slice(0, 80))

/** A FITS file put together from generated cards: a valid start, then anything, with some pixel bytes. */
const generatedFits = fc
  .tuple(
    fc.boolean(),
    fc.array(card, { maxLength: 60 }),
    fc.boolean(),
    fc.integer({ min: 0, max: 3 * BLOCK }),
    fc.boolean()
  )
  .map(([valid, cards, end, dataBytes, padded]) => {
    const head = valid ? ['SIMPLE  =                    T', 'BITPIX  =                   16', 'NAXIS   =                    2'].map(c => c.padEnd(80)) : []
    const text = [...head, ...cards, ...(end ? ['END'.padEnd(80)] : [])].join('')
    const header = padded ? text.padEnd(Math.ceil(Math.max(1, text.length) / BLOCK) * BLOCK) : text
    return Buffer.concat([Buffer.from(header, 'latin1'), Buffer.alloc(dataBytes, 7)])
  })

describe('FITS readers under fuzz', () => {
  it('[FUZ-002, FUZ-003, ING-006, ING-015] Given random bytes, When the scanner parses them as FITS, Then it returns headers or its documented error, and parseFitsFile reports them invalid without throwing', async () => {
    await fc.assert(fc.asyncProperty(fc.uint8Array({ maxLength: 3 * BLOCK }), bytes => BINARY_CONTRACTS.parseFitsHeaders(bytes)), fuzzParams())
  }, FUZZ_TEST_TIMEOUT_MS)

  it('[FUZ-002, FUZ-003, ING-006] Given a FITS file assembled from borderline cards, When the scanner parses it with pixel statistics, Then it never throws, hangs or reads past the file', async () => {
    await fc.assert(fc.asyncProperty(generatedFits, bytes => BINARY_CONTRACTS.parseFitsHeaders(bytes)), fuzzParams())
  }, FUZZ_TEST_TIMEOUT_MS)

  it('[FUZ-002, FUZ-003, ING-006] Given a valid FITS file with a few bytes changed, When the scanner parses it, Then it returns headers or its documented error', async () => {
    await fc.assert(fc.asyncProperty(mutatedBytes(SEEDS, () => BLOCK), bytes => BINARY_CONTRACTS.parseFitsHeaders(bytes)), fuzzParams())
  }, FUZZ_TEST_TIMEOUT_MS)

  it('[FUZ-002, FUZ-003, INS-003] Given random bytes, When the image reader reads them, Then it refuses them with a reason', async () => {
    await fc.assert(fc.asyncProperty(fc.uint8Array({ maxLength: 3 * BLOCK }), bytes => BINARY_CONTRACTS.readFitsImage(bytes)), fuzzParams())
  }, FUZZ_TEST_TIMEOUT_MS)

  it('[FUZ-002, FUZ-003, INS-003, NFR-019] Given a FITS file assembled from borderline cards, When the image reader reads it, Then it returns whole planes or refuses it with a reason, never allocating for pixels the file lacks', async () => {
    await fc.assert(fc.asyncProperty(generatedFits, bytes => BINARY_CONTRACTS.readFitsImage(bytes)), fuzzParams())
  }, FUZZ_TEST_TIMEOUT_MS)

  it('[FUZ-002, FUZ-003, INS-003] Given a valid FITS image with a few bytes changed, When the image reader reads it, Then it returns whole planes or refuses it with a reason', async () => {
    await fc.assert(fc.asyncProperty(mutatedBytes(SEEDS, () => BLOCK), bytes => BINARY_CONTRACTS.readFitsImage(bytes)), fuzzParams())
  }, FUZZ_TEST_TIMEOUT_MS)

  it('[FUZ-001, FUZ-004] Given any 80 characters, When parsed as a header card, Then the keyword and text are kept and a number is finite', async () => {
    await fc.assert(fc.asyncProperty(fc.oneof(card.map(c => Buffer.from(c, 'latin1')), fc.uint8Array({ maxLength: 80 })), bytes => BINARY_CONTRACTS.parseHeaderCard(bytes)), fuzzParams())
  }, FUZZ_TEST_TIMEOUT_MS)
})

describe('the two FITS card readers agree', () => {
  const printable = fc.string({ unit: fc.integer({ min: 0x20, max: 0x7e }).map(c => String.fromCharCode(c)), maxLength: 72 })
  const valueLike = fc
    .tuple(fc.constantFrom('= ', '=', '  '), fc.oneof(fc.constantFrom(...VALUES), fc.double().map(String), fc.integer().map(String), printable), fc.constantFrom('', ' / a comment', '/x', " 'tail'"))
    .map(([indicator, value, tail]) => `${indicator}${value}${tail}`)

  it('[FUZ-005] Given any header card, When the scanner and the image reader read the same file, Then they give the card the same value', async () => {
    await fc.assert(fc.asyncProperty(fc.oneof(valueLike, printable), rest => BINARY_CONTRACTS.fitsCardsAgree(Buffer.from(rest, 'latin1'))), fuzzParams())
  }, FUZZ_TEST_TIMEOUT_MS)
})
