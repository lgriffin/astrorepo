# astrorepo Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-07-15

## Active Technologies

- TypeScript 5.x (Node.js 20 LTS) + Electron, React 18, better-sqlite3, Drizzle ORM, astronomy-engine, Vite (001-universal-observatory)

## Project Structure

```text
src/
tests/
```

## Commands

npm test; npm run lint; npm run ears (EARS traceability gate)

Architecture: hexagonal core in `packages/` (see docs/architecture/hexagonal.md). New logic goes in
`packages/domain` / `packages/application`; requirement IDs from `specs/*/requirements.md` go in test names.

## Code Style

TypeScript 5.x (Node.js 20 LTS): Follow standard conventions

## Charter and docs

- Charter: `.specify/memory/constitution.md`. Roadmap: `docs/roadmap.md`. Guides: `docs/guides/`, `docs/architecture/hexagonal.md`.
- Every behaviour change updates its spec's `requirements.md`, the roadmap and the relevant guide in the same PR.
- Schema changes go in `src/main/db/migrations.ts` only (tests use it too).

## Recent Changes

- 014-siril-space: stacking plan on the target page (recommended stock Siril script, stage-by-stage disk space, fits or short) via SirilWorkspace.frameDetails/workAreaSpace
- 013-ranked-cockpit: Next actions list ranks tonight's captures (closing seasons first) ahead of stacking suggestions
- 012-seasons-moon: forward plan (tonight, closing seasons, new-moon windows, 12-month seasons) via Ephemeris/PlanningSettings/TargetPositions ports and an astronomy-engine adapter
- 011-ingest-core: Siril work area (sources never renamed), fast rescans, quarantine, sampled SHA-256 duplicate check
- 010-discovery-cockpit: hidden-data report, derived progress, per-target discovery, dismissible suggestions, one migration source, charter

- 002-fits-metadata-analyzer: Added custom FITS parser, metadata analyzer, settings service, per-target/per-night aggregates
- 001-universal-observatory: Added TypeScript 5.x (Node.js 20 LTS) + Electron, React 18, better-sqlite3, Drizzle ORM, astronomy-engine, Vite

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
