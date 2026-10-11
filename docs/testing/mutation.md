# Mutation testing

Coverage tells you a line ran under test. Mutation testing tells you whether a test would notice
if that line were wrong. [Stryker](https://stryker-mutator.io) makes one small change at a time
to the core (`packages/domain/src`, `packages/application/src`): a `<` becomes `<=`, an `&&`
becomes `||`, a condition becomes `true`, a string becomes `""`. It runs the tests that cover that
line. If one fails, the mutant is **killed**; if all pass, it **survived**, and there is a
behaviour no test pins down. The mutation score is killed / (killed + survived + no coverage).

Requirements: [specs/030-mutation-testing](../../specs/030-mutation-testing/requirements.md).

## Running it

| Command | What it mutates |
|---|---|
| `npm run test:mutation` | The whole core. Around 9,900 mutants: allow over an hour on four cores. |
| `npm run test:mutation:changed` | Only core files changed against `origin/main` (committed, uncommitted and untracked), plus the source a changed core test is named after (`test/x.test.ts` → `src/x.ts` or `src/use-cases/x.ts`). When only the gate's own set-up changed (its configs, `scripts/mutation/`, its workflow, `package.json` or the lockfile) it mutates one smoke file, `packages/domain/src/scan-pacing.ts`, so the gate still runs end to end. Exits at once, and notes the skip for the CI summary, when there is nothing to mutate. |
| `npm run test:mutation:changed -- --base origin/my-branch` | The same, against another base. |
| `npm run test:mutation -- --mutate packages/domain/src/jobs.ts` | One file, while you work on its tests. |

Extra Stryker options go after a second `--` in changed mode, for example
`npm run test:mutation:changed -- -- --concurrency 2`.

Runs are incremental: `reports/stryker-incremental.json` remembers each mutant's result, and a
later run re-tests only mutants whose code or covering tests changed. Add `--force` to re-test
everything. CI keeps the file in the Actions cache, not in git.

The run fails when the score is below the break threshold (`DEFAULT_BREAK` in
`scripts/mutation/scope.mjs`, overridable with `MUTATION_BREAK=<0-100>`). Only the core's unit
tests (`packages/*/test`, see `vitest.mutation.config.ts`) run against mutants. The TypeScript
checker drops mutants that would not compile before any test runs.

### Baseline

The first full run (2026-10-11) tested 6,272 valid mutants and killed 4,819: a score of **76.8%**
(domain 76.9%, application 76.4%), with 22 files under 80% and the weakest near 67%. About 250
sharper tests then brought every one of those files to between 84% and 100% on its own run. The
whole-core re-run that followed killed 5,598 of 6,276 valid mutants: **89.2%** (domain 88.3%,
application 92.7%), with no file under 80%.

`DEFAULT_BREAK` is **80**, Leigh's minimum, for the whole core and for each changed-files run. A
pull request that touches a core file must keep that file's tests sharp enough to stay above it.
The floor is a ratchet: raise it as survivors are killed, and never lower it to get a pull request
through.

## Reading the report

Open `reports/mutation/mutation.html`. The top level shows the score per file; click into a file
to see each mutant inline. Filter on **Survived** and **No coverage**:

- **No coverage**: no test reaches that line at all. Write one.
- **Survived**: a test reaches the line but asserts nothing that the change breaks. Typical
  causes: a boundary (`<` versus `<=`) never tested at the edge, a message or reason string never
  asserted, a branch whose two arms give the same answer for every input the tests use.

Kill a mutant with a test of real behaviour: an input at the boundary, an assertion on the
reason the user sees. A test that exists only to pin an implementation detail is worse than a
surviving mutant. `reports/mutation/mutation.json` holds the same data;
`node scripts/mutation/summary.mjs` prints the Markdown table the CI job summary shows.

## Equivalent mutants

Some mutants cannot be killed because the changed code behaves identically for every input: a
`<=` that only differs from `<` where both arms return the same value, a guard the next line
makes redundant, a sort comparator mutated on input that is already unique. Disable those, and
only those, on the line, with the mutator and the reason:

```ts
// Stryker disable next-line EqualityOperator: at n === max both branches return max
return n < max ? n : max
```

A disable is acceptable when you can say why no input could tell the two programs apart. It is
not acceptable because the test would be awkward to write, because the mutant is in logging or
wording the user sees (assert the wording), or to get a run over the threshold. Reviewers should
read each new disable comment like code.

`ignoreStatic` is on: mutants in code that runs once at module load (constant tables) are
ignored, because perTest coverage cannot attribute them to a test and they would otherwise run the
whole suite each.
