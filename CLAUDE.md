# astrorepo Development Guidelines

Auto-generated from all feature plans, then kept by hand. Last updated: 2026-10-14

## Active Technologies

- TypeScript 5.x (Node.js 20 LTS), Electron (electron-vite, Electron Forge), React 18 with react-router and Tailwind, Vite
- better-sqlite3 with plain SQL migrations in `src/main/db/migrations.ts`; Zod validates every IPC input
- astronomy-engine for sun, moon and sidereal time (behind the Ephemeris port)
- Testing: Vitest with coverage-v8, an own Gherkin runner (`packages/testkit/src/bdd`), fast-check property and fuzz tests, Stryker mutation testing

## Project Structure

```text
packages/
  domain/        pure rules, no I/O (new logic goes here)
  application/   use cases and the ports they need
  testkit/       in-memory fakes, port contract suites, BDD runner
src/
  main/          Electron main: adapters (src/main/adapters), composition root, IPC, jobs host, legacy services
  preload/       the api.invoke() bridge
  renderer/      React app
  shared/        types and navigation shared by main and renderer
specs/<nnn>/     requirements.md (EARS IDs) per feature
features/<area>/ Gherkin features run by tests
tests/           unit, integration, contracts, architecture, fuzz
scripts/         ears gate, mutation scope, fuzz runner
```

## Commands

npm test; npm run lint; npm run typecheck; npm run ears (EARS traceability gate); npm run test:fuzz;
npm run test:mutation:changed (mutation gate on changed core files, floor 80%)

Architecture: hexagonal core in `packages/` (see docs/architecture/hexagonal.md). New logic goes in
`packages/domain` / `packages/application`; requirement IDs from `specs/*/requirements.md` go in test names.

## Code Style

TypeScript 5.x (Node.js 20 LTS): Follow standard conventions

## Charter and docs

- Charter: `.specify/memory/constitution.md`. Roadmap: `docs/roadmap.md`. Guides: `docs/guides/`, `docs/architecture/hexagonal.md`.
- Every behaviour change updates its spec's `requirements.md`, the roadmap and the relevant guide in the same PR.
- Schema changes go in `src/main/db/migrations.ts` only (tests use it too).

## Recent Changes

- 041-look-and-feel V1 (Leigh's "impeccable" UX overhaul, 2026-10-25): every renderer colour is a theme token (CSS variables from src/shared/themes.ts; rules in src/shared/appearance.ts; tokenColor() in src/renderer/theme.ts for SVG/inline), dark/light/night via setting ui_theme (Settings → Appearance, ThemeProvider); tests/unit/look-and-feel.test.ts fails on hex, rgb() or Tailwind palette classes in src/renderer and on AA contrast; shared controls in src/renderer/components/ui; Lucide icons per place in components/common/nav-icons.tsx; Impeccable plugin pinned in .claude/settings.json (docs/design.md, PRODUCT.md). Next: Impeccable direction round, then V2-V7 after the mosaic slices
- 037-mosaic-workspace X1 (observation intelligence proposal, docs/proposals/, Leigh 2026-10-25): Collections → Mosaics (pages/MosaicWorkspaces.tsx list + new, pages/MosaicWorkspace.tsx detail, components/mosaic/GridEditor + MosaicCanvas SVG on the grid's tangent plane). Rules in packages/domain/src/mosaic-workspace.ts (layoutGrid, gridProblems, parseRa/parseDec, gridCsv/gridJson; position angle = up axis east of north, solver rotation = -PA), use cases in packages/application/src/use-cases/mosaic-workspace.ts over MosaicWorkspaceStore (tables mosaic_workspaces, mosaic_revisions, mosaic_panels; revisions immutable). workspace:* channels; Sky planner card's "Open in Mosaics" copies spec 024's plan. MO- IDs; X2 (FITS placement) and X3 (coverage) next, then specs 038-040 (projects AP-, forecasts AI-, experiments PE-)
- 035-pi-variant R1: Raspberry Pi variant (headless server + Chromium kiosk, Leigh 2026-10-15). Handlers register on ChannelRouter (src/main/transport/router.ts) via registerHandlers(router, desktop); pickers/save/open go through the Desktop port (src/main/transport/desktop.ts); Electron only in src/main/index.ts and src/main/electron/ (ipc-host, electron-desktop, jobs-environment, native-thumbnails, picture-shrinker), checked by PI-005; initDatabase(dataFolder), useSeedFolder, startJobs(environment). R2: headless server `npm run serve` (src/server/main.ts via tsx, settings ASTRO_DATA/STATIC/BIND/PORT/HOSTS, default 127.0.0.1:8090, own data folder astrorepo-server, windowJobs:false so the run window never starts jobs), createHttpHost in src/main/http/http-host.ts (POST /api/invoke/<channel>, Host allowlist, per-start token in a meta tag + X-Astrorepo-Token), ServedDesktop, renderer fallback bridge src/renderer/bridge.ts. RC companion screens: the desktop app serves itself to paired screens (makeCompanionHost in src/main/http/companion-host.ts, createHttpHost({ companions }), X-Astrorepo-Device key, /api/companion/pair|pair-status|screen); rules in packages/domain/src/companion.ts, makeCompanion over CompanionDeviceStore/CompanionSecrets (table companion_devices); companion:* channels in src/main/ipc/companion-handlers.ts (desktop router only); renderer PairScreen, CompanionLinks (follow / report route), Settings → Companion screens. Next: R3 Pi install
- 036-clear-skies: Leigh's "clear skies" for the next 3 nights on Home (components/cockpit/ClearSkiesCard.tsx, first card) via makeClearSkies over the WeatherSource port (Open-Meteo default, MET Norway, Leigh's weatherlink_website /api/v1/forecast in src/main/adapters/http-weather.ts) and WeatherSettings (Settings → Weather, keys weather_provider/weather_service_address); rules in packages/domain/src/clear-skies.ts (judgeNight over the ephemeris's dark samples), feed readers in weather-feeds.ts; answers cached 30 min in composition (makeWeatherCache)
- 034-vespera-ingest: Leigh's Vespera Pro ingest design; rules in packages/domain/src/vespera-ingest.ts (SESSION/RUN/IMAGE grammar, findings, DESTINATION_FOLDER grammar, copy order), use cases in packages/application/src/use-cases/vespera-ingest.ts over VesperaScope (read-only)/IngestDisk/VesperaMetadata/VesperaTransferStore; FtpVesperaScope streams over 033's FTP connection with REST; the Vespera page's one copy flow is the "On the Vespera" card (components/vespera/IngestPanel.tsx) via src/main/vespera-ingest-host.ts and makeVesperaCopyQueue (ticked sessions one after another into <landing>/<target>/<name>, room checked, home scan after); FITS and TIFF by default; transfers indexed in astrorepo.transfers.json at the landing root
- 033-vespera-ftp: Vespera page (src/renderer/pages/Vespera.tsx) Connection card (address, landing folder, kinds) over the ScopeFiles port; its own list/copy was replaced by 034; native FTP client in src/main/adapters/node-ftp-scope.ts (READ_ONLY_COMMANDS only), FTP parsing in packages/domain/src/ftp.ts, test server in tests/helpers/ftp-server.ts; long-lived host src/main/vespera-host.ts runs the home scan after a copy
- 031-gallery: Files → Gallery (src/renderer/pages/Images.tsx) over makePictureGallery; picture names read by readImageName/objectNameIndex (packages/domain/src/object-names.ts) against the ObjectCatalogue port, which the poster should reuse; PictureFolder reads <home>/images, shrunk by src/main/picture-shrinker.ts
- 032-messier-mosaic: Messier mosaic (src/renderer/pages/MessierMosaic.tsx, /messier, messierLink) via MessierCatalogue/TilePictures ports and makeMessierMosaic; gap outlook reuses the forward plan's rules; top 3 gaps tonight in Next actions ('messier-gap'); previewImage stretch 'linear' for finished images; JPEG/TIFF drawn by the host (src/main/native-thumbnails.ts)
- 017-unified-ux U5: sentence-case labels checked by tests/unit/wording.test.ts (tests/helpers/ui-text.ts walks the renderer's JSX); add real names to its PROPER list
- 017-unified-ux U4: site only in Settings → Your site; Get set up checklist (src/shared/setup.ts, components/cockpit/SetupCard.tsx, hidden by setting setup_checklist_hidden); empty pages use EmptyState with a link
- 017-unified-ux U3: a target's page in tabs (TARGET_TABS, targetLink(id, tab) in src/shared/navigation.ts); Stack and process in components/target/ProcessTab.tsx shows runsForTarget and hides a step's Queue button while its job is active
- 017-unified-ux U2: Home leads with Next actions; totals on Insights (ObservatoryTotals); withQueuedJobs marks stacking suggestions already in Jobs; shared Card/EmptyState/LinkButton in components/common/Card.tsx
- 017-unified-ux: one map of places (src/shared/navigation.ts) drives the grouped sidebar, page titles, back links and Settings section links; jobs status under the sidebar. Pages take their title from the map (no literal PageContainer title on a place)
- 016-job-runner: CI-like job queue (run window, idle PC, one at a time, predicted length, live logs) via JobStore/ProcessRunner/MachineMonitor/JobLogs ports and the jobs host in src/main/jobs-host.ts
- 015-tool-hub: ToolHub port (Settings > Tools) and the Siril_Scripts v2 post-processing recipe on each target's page via StackCatalogue
- 014-siril-space: stacking plan on the target page (recommended stock Siril script, stage-by-stage disk space, fits or short) via SirilWorkspace.frameDetails/workAreaSpace/copyBytes
- 013-ranked-cockpit: Next actions list ranks tonight's captures (closing seasons first) ahead of stacking suggestions
- 012-seasons-moon: forward plan (tonight, closing seasons, new-moon windows, 12-month seasons) via Ephemeris/PlanningSettings/TargetPositions ports and an astronomy-engine adapter
- 011-ingest-core: Siril work area (sources never renamed), fast rescans, quarantine, sampled SHA-256 duplicate check
- 010-discovery-cockpit: hidden-data report, derived progress, per-target discovery, dismissible suggestions, one migration source, charter

- 002-fits-metadata-analyzer: Added custom FITS parser, metadata analyzer, settings service, per-target/per-night aggregates
- 001-universal-observatory: Added TypeScript 5.x (Node.js 20 LTS) + Electron, React 18, better-sqlite3, Drizzle ORM, astronomy-engine, Vite

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
