# 030 Mutation testing: requirements

Line coverage says a test ran the code; it does not say a test would notice if the code were
wrong. This slice adds a mutation gate for the hexagonal core (packages/domain and
packages/application): Stryker changes the code one small edit at a time (a `<` becomes `<=`, a
condition becomes `true`, a string becomes empty) and checks that some test fails. The share of
edits the tests catch is the mutation score.

## What this slice delivers

- `npm run test:mutation` mutates the whole core and writes an HTML and JSON report to
  `reports/mutation/`.
- `npm run test:mutation:changed` mutates only the core files that differ from `origin/main` (and
  the sources of changed core tests, or one smoke file when only the gate's set-up changed), so a
  pull request pays only for what it touched.
- A `Mutation` workflow runs the changed-files gate on pull requests that touch the core or the gate, and the
  full run nightly and on demand. Both fail below the break threshold and upload the HTML report.
- A first full-core baseline (76.8%) and a break threshold of 65 set just under the weakest
  sizeable files, to be raised as survivors are killed.

## Decisions

- **Stryker 9.6, not 10.** Stryker 10 needs Node 22; CI runs Node 20.
- **Only the core's own tests run against mutants.** The contract suites in `tests/contracts`
  exercise adapters (SQLite, the file system), not the core's rules, and would slow every mutant.
- **The incremental file is cached, not committed.** CI restores `reports/stryker-incremental.json`
  with `actions/cache`, so unchanged mutants are not re-run and the repository holds no
  machine-generated state.
- **Equivalent mutants are disabled in place**, with a reason, never by lowering the threshold
  (see docs/testing/mutation.md).

## Mutation gate

| ID | Pattern | Requirement |
|----|---------|-------------|
| MUT-001 | Ubiquitous | The mutation gate shall mutate every TypeScript source file under packages/domain/src and packages/application/src except the index.ts barrels and the port files that declare only interfaces. |
| MUT-002 | Event | When the changed-files mode runs, the mutation gate shall mutate only the mutable core files that differ from the base ref and the core source files named after a changed core test, including uncommitted and untracked files and excluding deleted ones. |
| MUT-003 | Unwanted | If no mutable core file, core test or file of the gate's own set-up differs from the base ref, then the changed-files mode shall exit successfully without starting a mutation run. |
| MUT-004 | Unwanted | If the mutation score falls below the break threshold, then the mutation gate shall fail the run. |
| MUT-005 | Unwanted | If the break threshold override is empty or not a number from 0 to 100, then the mutation gate shall use the default threshold rather than disable the break. |
| MUT-006 | Event | When a mutation run finishes in CI, the mutation gate shall write the overall, per-package and worst per-file mutation scores to the job summary. |
| MUT-007 | Event | When only the gate's own set-up (its Stryker, vitest and tsconfig files, its scripts, its workflow or the npm manifests) differs from the base ref, the changed-files mode shall mutate one small smoke file so the gate runs end to end. |
| MUT-008 | Unwanted | If the changed-files mode is given --base without a ref, then it shall print its usage and exit with status 2 rather than call git. |
| MUT-009 | Unwanted | If the changed-files mode skipped the run, then the job summary shall say the run was skipped rather than that it failed before testing mutants. |
