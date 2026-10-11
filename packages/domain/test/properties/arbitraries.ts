import fc from 'fast-check'

/**
 * Generators the property tests share (specs/029-property-fuzz). Property tests run on every
 * `npm test` with fast-check's default 100 runs; PROPERTY_RUNS raises that, and FUZZ_SEED and
 * FUZZ_PATH replay a reported failure.
 */
export const propertyParams = (): fc.Parameters<unknown> => {
  const runs = Number(process.env.PROPERTY_RUNS)
  const seed = process.env.FUZZ_SEED
  const path = process.env.FUZZ_PATH
  return { ...(Number.isInteger(runs) && runs > 0 ? { numRuns: runs } : {}), ...(seed ? { seed: Number(seed) } : {}), ...(path ? { path } : {}) }
}

/** A plain file or folder name: letters, digits, spaces and the punctuation capture software uses. */
export const fileStem = fc.string({ unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 _-.()'.split('')), minLength: 1, maxLength: 16 })

/** Any text at all, including separators, control characters and astral planes. */
export const anyText = fc.oneof(fc.string({ maxLength: 40 }), fc.string({ unit: 'binary', maxLength: 40 }))

/** A date between 2000 and 2040, whole milliseconds. */
export const instant = fc.integer({ min: Date.UTC(2000, 0, 1), max: Date.UTC(2040, 0, 1) }).map(ms => new Date(ms))

/** A list and the same list in another order, for order-independence properties. */
export const withPermutation = <T>(items: fc.Arbitrary<T[]>) =>
  items.chain(xs => fc.tuple(fc.constant(xs), fc.shuffledSubarray(xs, { minLength: xs.length, maxLength: xs.length })))
