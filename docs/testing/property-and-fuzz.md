# Property and fuzz tests

Spec: [specs/029-property-fuzz](../../specs/029-property-fuzz/requirements.md). Both kinds use
[fast-check](https://fast-check.dev/).

| Kind | Where | Runs |
|------|-------|------|
| Property tests: an invariant of a domain rule | `packages/domain/test/properties/*.property.test.ts` | 100 a property in `npm test`; `PROPERTY_RUNS` raises it |
| Fuzz tests: a parser of untrusted input keeps its contract | `tests/fuzz/*.fuzz.test.ts` | `FUZZ_RUNS`: 200 in `npm test`, 20,000 in `npm run test:fuzz` and the nightly **Fuzz** workflow |
| Corpus: every input that once broke a parser | `tests/fuzz/corpus/<target>/` | Replayed on every `npm test` |

## Writing a property test

State something that holds for every input, not one example: a partition (every file in exactly
one group), a range (an angle in (-180, 180]), a round trip (`parseClock(formatClock(m)) === m`),
monotonicity (more frames never need less disk) or order independence (shuffled input, same
answer). Then generate the input:

```ts
import fc from 'fast-check'
import { propertyParams } from './arbitraries'

it('[JOB-012, FUZ-006] Given any minute of the day, When written and read back, Then it is the same minute', () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 1439 }), m => {
      expect(parseClock(formatClock(m))).toBe(m)
    }),
    propertyParams()
  )
})
```

- Cite the rule's own requirement and `FUZ-006` in the title, as every test cites an EARS ID.
- Give the predicate a block body. An arrow that returns `expect(...)` hands fast-check a value it
  can read as `false`.
- Generate what the rule really receives (unique paths, sorted times), and use
  `arbitraries.ts` for shared shapes. Prefer bounds over filters: `fc.integer({ min: 1 })`, not
  `.filter(n => n > 0)`.

## Writing a fuzz test

Each parser has one contract checker in `tests/fuzz/contracts.ts`: what it may return, the only
error it may throw (a plain `Error` with a message, `TiffReadError`, a typed `{ ok: false }`), and
that it finishes within the run budget. A new parser gets a checker there, then two properties in a
`*.fuzz.test.ts` file: one with random input (`textish()`, `fc.uint8Array()`) and one with
mutations of valid seeds (`mutatedText`, `mutatedBytes`), or input assembled from its format's
parts, since random bytes rarely get past a magic number. Wrap each property in
`fuzzParams()` and give the test `FUZZ_TEST_TIMEOUT_MS`.

Hangs: an async run that does not settle within `FUZZ_RUN_BUDGET_MS` (2 s) fails with its seed,
and `withinBudget` fails a synchronous run that takes longer, which is how a super-linear parser
shows itself on larger input. A true infinite loop is stopped by the test's timeout and the
workflow's 90 minutes.

## Replaying a failure

fast-check prints the seed, the path and the shrunk input:

```text
Property failed after 504 tests
{ seed: 1686686060, path: "503:4:1:1:2", endOnFailure: true }
Counterexample: ["cd ../~k bias ..."]
```

Run the one test again with them:

```sh
FUZZ_SEED=1686686060 FUZZ_PATH="503:4:1:1:2" npx vitest run tests/fuzz/text-parsers.fuzz.test.ts -t "splitSirilScript input with a few spans"
```

The same variables replay a property test. The nightly workflow uploads `fuzz.log` and
`fuzz-seeds.txt` as the `fuzz-failures` artifact when it fails.

Once the bug is fixed:
1. Save the input in `tests/fuzz/corpus/<target>/`, named for what it does: `.txt` for text,
   anything else (`.bin`) for bytes. `<target>` is the checker's name in `contracts.ts`.
2. Add an example test beside the parser's other tests that names the bug, citing its requirement.
