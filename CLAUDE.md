# astrorepo Development Guidelines

The rules for working in this repo. How to set up and build a slice is in
[CONTRIBUTING.md](CONTRIBUTING.md); where each past slice put its code is in
[docs/architecture/slice-notes.md](docs/architecture/slice-notes.md). Last updated: 2026-11-07.

## Technologies

- TypeScript 5.x on Node.js 22 LTS (`.nvmrc`); Electron (electron-vite, Electron Forge); React 18 with react-router and Tailwind; Vite
- better-sqlite3 with plain SQL migrations in `src/main/db/migrations.ts`; Zod validates every IPC input
- astronomy-engine for sun, moon and sidereal time (behind the Ephemeris port)
- Testing: Vitest with coverage-v8, an own Gherkin runner (`packages/testkit/src/bdd`), fast-check property and fuzz tests, Stryker mutation testing, Playwright smoke with axe

## Project structure

```text
packages/
  domain/        pure rules, no I/O (new logic goes here)
  application/   use cases and the ports they need
  testkit/       in-memory fakes, port contract suites, BDD runner
src/
  main/          Electron main: adapters (src/main/adapters), composition root, IPC, jobs host, legacy services
  preload/       the api.invoke() bridge
  renderer/      React app
  shared/        types and rules shared by main and renderer
  server/        the headless server (npm run serve)
specs/<nnn>/     requirements.md (EARS IDs) per feature
features/<area>/ Gherkin features run by tests
tests/           unit, integration, contracts, architecture, fuzz
scripts/         doctor, verify, ears gate, smoke, demo, new-slice, mutation scope, fuzz runner
```

## Commands

`npm run verify` (every gate: lint, typecheck, typecheck:tests, ears, test); `npm run doctor` (set-up check);
`npm test`; `npm run lint`; `npm run typecheck`; `npm run ears`; `npm run new:slice -- --name <name> --prefix <ABC> --title "<Title>"`;
`npm run test:fuzz`; `npm run test:mutation:changed` (mutation gate on changed core files, floor 80%);
`npm run smoke` (after `npm run build`: every page in every theme, axe; `-- --demo` over the demo);
`npm run demo` (demo library in `.demo/`; `-- --serve`; `npm run dev:demo`).

## Rules

- **Hexagonal.** New logic goes in `packages/domain` (pure) and `packages/application` (use cases over
  ports); adapters in `src/main/adapters` take a `Database` in the constructor. See
  docs/architecture/hexagonal.md. The domain imports only itself; legacy services in
  `src/main/services` may not import adapters (HEX-007), and the legacy ratchet allows no new
  `getSqlite()` calls.
- **Every new port** has a contract suite in `packages/testkit/src/contracts`, run on the fake and the
  real adapter from `tests/contracts`.
- **EARS.** Every behaviour is a requirement in `specs/<nnn>/requirements.md`; every ID is cited in a
  test title as `[ABC-001] Given … When … Then …`. An Unwanted requirement's test title needs a
  failure word (fail, refuse, reject, error, invalid, missing, cannot, not, warn).
- **Docs in the same PR.** A behaviour change updates its spec, `docs/roadmap.md`, the relevant
  guide in `docs/guides/`, `CHANGELOG.md` and a line in `docs/architecture/slice-notes.md`.
- **Schema changes** go in `src/main/db/migrations.ts` only (tests use it too).
- **Renderer.** Colours are theme tokens only (no hex, rgb() or Tailwind palette classes;
  `tests/unit/look-and-feel.test.ts`); labels are sentence case (`tests/unit/wording.test.ts`; add
  real names to its PROPER list); anything clickable works from the keyboard (`pressable()` for
  rows and cards, `tests/unit/keyboard.test.ts`); pages take their title from `src/shared/navigation.ts`.
- **Smoke.** Both axe baselines (`scripts/smoke/axe-baseline*.json`) are empty: a new serious
  finding fails CI. Fix it rather than accepting it.
- **Lint** runs with `--max-warnings 0`, also in the pre-commit hook.
- **Charter:** `.specify/memory/constitution.md`. Design: `docs/design.md`, `PRODUCT.md`.
