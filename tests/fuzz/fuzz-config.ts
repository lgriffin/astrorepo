import fc from 'fast-check'

/**
 * Settings every fuzz test shares (docs/testing/property-and-fuzz.md):
 * - FUZZ_RUNS: runs per property. Small by default so `npm test` stays fast; `npm run test:fuzz`
 *   raises it.
 * - FUZZ_SEED and FUZZ_PATH: replay a failure fast-check reported (run one test with `-t`).
 * - FUZZ_RUN_BUDGET_MS: the longest one run may take before it counts as a hang.
 */
const positive = (text: string | undefined, fallback: number) => {
  const n = Number(text)
  return Number.isInteger(n) && n > 0 ? n : fallback
}

export const FUZZ_RUNS = positive(process.env.FUZZ_RUNS, 200)
export const RUN_BUDGET_MS = positive(process.env.FUZZ_RUN_BUDGET_MS, 2000)
/** The whole test's limit: generous per run, so only a hang or a pathological slowdown reaches it. */
export const FUZZ_TEST_TIMEOUT_MS = 60_000 + FUZZ_RUNS * 25

/** fast-check parameters for one fuzz property, with any replay seed and path from the environment. */
export function fuzzParams<T>(overrides: fc.Parameters<T> = {}): fc.Parameters<T> {
  const seed = process.env.FUZZ_SEED
  const path = process.env.FUZZ_PATH
  return {
    numRuns: FUZZ_RUNS,
    // An async run that does not settle within the budget fails as a hang, with its seed.
    timeout: RUN_BUDGET_MS,
    ...(seed !== undefined && seed !== '' ? { seed: Number(seed) } : {}),
    ...(path ? { path } : {}),
    ...overrides
  }
}

export class HangError extends Error {}

/**
 * Runs one parse and fails it when it takes longer than the per-run budget. Synchronous code
 * cannot be interrupted, so this catches the super-linear slowdowns that become hangs on larger
 * input; a true infinite loop is caught by the test's timeout and the workflow's.
 */
export function withinBudget<T>(label: string, run: () => T): T {
  const start = performance.now()
  const out = run()
  const ms = performance.now() - start
  if (ms > RUN_BUDGET_MS) throw new HangError(`${label} took ${Math.round(ms)} ms, over the ${RUN_BUDGET_MS} ms budget`)
  return out
}

export async function withinBudgetAsync<T>(label: string, run: () => Promise<T>): Promise<T> {
  const start = performance.now()
  const out = await run()
  const ms = performance.now() - start
  if (ms > RUN_BUDGET_MS) throw new HangError(`${label} took ${Math.round(ms)} ms, over the ${RUN_BUDGET_MS} ms budget`)
  return out
}

/** Text that looks like what the parsers read: printable ASCII, tabs and both kinds of line end. */
export const textish = (maxLength = 400) =>
  fc.oneof(
    fc.string({ maxLength }),
    fc.string({ unit: 'binary', maxLength }),
    fc.array(fc.constantFrom(' ', '\t', '\r', '\n', '\r\n', ':', '=', '|', ',', '%', '.', '-', '+', '#', "'", '"', '/', '\\', '0', '1', '9', 'a', 'Z'), { maxLength })
      .map(parts => parts.join(''))
  )

/** Inserts, deletes, overwrites or duplicates a few spans of a seed text, keeping most of its shape. */
export const mutatedText = (seeds: readonly string[], pieces: readonly string[] = []) =>
  fc
    .tuple(
      fc.constantFrom(...seeds),
      fc.array(
        fc.record({
          at: fc.nat(),
          drop: fc.nat({ max: 12 }),
          insert: fc.oneof(fc.constantFrom('', ...pieces), fc.string({ maxLength: 12 }), fc.string({ unit: 'binary', maxLength: 4 }))
        }),
        { maxLength: 6 }
      )
    )
    .map(([seed, edits]) =>
      edits.reduce((text, e) => {
        const at = text.length === 0 ? 0 : e.at % (text.length + 1)
        return text.slice(0, at) + e.insert + text.slice(at + e.drop)
      }, seed)
    )

/** Byte mutations of a valid file: flips, overwrites with boundary values, truncation and splices. */
export const mutatedBytes = (seeds: readonly Buffer[], focus?: (seed: Buffer) => number) =>
  fc
    .tuple(
      fc.constantFrom(...seeds),
      fc.array(
        fc.oneof(
          fc.record({ kind: fc.constant('flip' as const), at: fc.nat(), bit: fc.integer({ min: 0, max: 7 }), near: fc.boolean() }),
          fc.record({ kind: fc.constant('set' as const), at: fc.nat(), value: fc.constantFrom(0x00, 0x01, 0x7f, 0x80, 0xfe, 0xff, 0x20, 0x30, 0x39), near: fc.boolean() }),
          fc.record({ kind: fc.constant('word' as const), at: fc.nat(), value: fc.constantFrom(0, 1, 0x7fffffff, 0x80000000, 0xffffffff, 0xffff, 8, 13), near: fc.boolean() }),
          fc.record({ kind: fc.constant('truncate' as const), at: fc.nat() }),
          fc.record({ kind: fc.constant('splice' as const), at: fc.nat(), bytes: fc.uint8Array({ maxLength: 16 }) })
        ),
        { minLength: 1, maxLength: 8 }
      )
    )
    .map(([seed, edits]) => {
      let buf = Buffer.from(seed)
      const zone = focus ? Math.max(1, Math.min(buf.length, focus(seed))) : buf.length
      for (const e of edits) {
        if (buf.length === 0) break
        const span = 'near' in e && e.near ? Math.min(zone, buf.length) : buf.length
        const at = e.at % span
        if (e.kind === 'flip') buf[at] ^= 1 << e.bit
        else if (e.kind === 'set') buf[at] = e.value
        else if (e.kind === 'word') {
          if (at + 4 <= buf.length) buf.writeUInt32LE(e.value >>> 0, at)
        } else if (e.kind === 'truncate') buf = buf.subarray(0, e.at % (buf.length + 1))
        else buf = Buffer.concat([buf.subarray(0, at), Buffer.from(e.bytes), buf.subarray(at)])
      }
      return buf
    })
