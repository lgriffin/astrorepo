# Testing and quality gates

Every change to astrorepo passes the same gates, locally and in CI. This page lists each kind of
test, where it lives, and what the build refuses. The three guides beside it go deeper:
[BDD](bdd.md), [property and fuzz tests](property-and-fuzz.md) and [mutation testing](mutation.md).

## The layers

| Kind | Where | What it proves | Run with |
|---|---|---|---|
| Domain unit tests | `packages/domain/test/*.test.ts` | Each pure rule by example, citing its EARS ID in the title | `npm test` |
| Use case tests | `packages/application/test/*.test.ts` | Each use case over the testkit's in-memory fakes: the happy path, every refusal and every failure the ports can raise | `npm test` |
| Property tests | `packages/domain/test/properties/*.property.test.ts` | Invariants over generated input: partitions, ranges, round trips, order independence | `npm test` (100 runs each) |
| Fuzz tests | `tests/fuzz/*.fuzz.test.ts` and `tests/fuzz/corpus/` | Every parser of untrusted bytes (FITS, PNG, TIFF, camera RAW, FTP replies and listings, Vespera metadata) keeps its contract on malformed input; every input that once broke one is replayed | `npm test` (200 runs), `npm run test:fuzz` (20,000) |
| Port contracts | `packages/testkit/src/contracts/*.contract.ts`, run from `tests/contracts/` | The fake and the real adapter of each port behave the same, so use case tests on fakes speak for the app | `npm test` |
| BDD features | `features/<area>/*.feature` | Leigh's journeys, in Leigh's own words, against the use cases | `npm test` |
| Integration tests | `tests/integration/` | Real SQLite, real folders: migrations, scans, the seed, composition | `npm test` |
| Adapter and presenter tests | `tests/unit/` | Adapters against real files, presenters' wording, IPC validation, the wording of every label | `npm test` |
| Architecture tests | `tests/architecture/` | The hexagon's import rules and the legacy ratchet | `npm test` |
| Mutation testing | Stryker over `packages/domain/src` and `packages/application/src` | The tests notice when the core's code is changed | `npm run test:mutation:changed`, `npm run test:mutation` |

## The gates

| Gate | Refuses | Where it runs |
|---|---|---|
| Lint (`npm run lint`) | Any ESLint warning in staged files; in CI, any error. The core may not use Node or browser globals | Pre-commit hook and CI |
| Type checks (`npm run typecheck`, `npm run typecheck:tests`) | A type error in the app or the tests | CI |
| EARS (`npm run ears`) | A requirement no test title or run Gherkin tag cites; an unknown or duplicated ID; wording that does not match its pattern; an "If ..., then ..." requirement without a test that names the failure | CI |
| Coverage (`npm test -- --coverage`) | The core under 95% lines and functions or 90% branches; adapters under 80% lines and functions or 75% branches; legacy code under its ratchet | CI |
| Contract coverage (`tests/contracts/coverage.test.ts`) | A port whose contract suite is not run on both a fake and a real adapter | CI |
| Hexagon (`tests/architecture/hexagon-boundaries.test.ts`) | The domain importing anything but itself, the application anything but itself and the domain, the core reading the clock, randomness or host globals, an adapter importing legacy code, a use case built outside composition | CI |
| Legacy ratchet (`tests/architecture/legacy-ratchet.test.ts`) | More `getSqlite()` calls, legacy services or legacy IPC calls than `legacy-ratchet.json` allows | CI |
| Wording (`tests/unit/wording.test.ts`) | A title-case label in the renderer | CI |
| Mutation, changed files | A pull request whose changed core files score under the floor (`DEFAULT_BREAK` in `scripts/mutation/scope.mjs`) | CI, on pull requests touching the core or the gate |
| Mutation, whole core | The whole core scoring under the floor | Nightly and on demand |
| Fuzz, long | Any parser failing its contract over 20,000 runs | Nightly and on demand |

CI runs lint, type checks, EARS, tests with coverage and the build on both Windows and Ubuntu, so
path and file-system differences (such as Windows refusing to truncate a file opened for
appending) are caught before merge.

## Adding a feature

1. Write the requirements in `specs/<nnn>/requirements.md` with fresh IDs.
2. Put the rules in `packages/domain` with example tests citing the IDs, and property tests for
   any parser, maths or ordering.
3. Put the orchestration in a use case in `packages/application`, tested over the testkit's fakes,
   including each refusal and each port failure.
4. Give every new port a contract suite in `packages/testkit/src/contracts`, run in
   `tests/contracts/` on the fake and on the real adapter.
5. Fuzz any adapter that reads bytes from outside the PC, and add a breaking input to the corpus
   when one is found.
6. Write the journey as a Gherkin feature when it is one Leigh would describe.
7. Run `npm run test:mutation:changed` before pushing and kill the survivors with tests of real
   behaviour; see [mutation.md](mutation.md) for when a disable comment is acceptable.
