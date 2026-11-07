# 045 Developer experience: requirements

Leigh asked (7 November 2026): "Can you do both a DX and a UX overhaul for the system." The plan
splits the developer side into slices D1 to D6 (the plan doc is linked from `docs/roadmap.md`).
This spec holds the IDs of the slices built so far; later slices add theirs when they start.

An audit on 7 November 2026 found that a fresh clone could not start the app: `npm install`
builds better-sqlite3 for Node, which the tests need, while Electron embeds a different Node and
refuses that build (NODE_MODULE_VERSION 127 against 130), and nothing built one for Electron. Node 20,
pinned in `.nvmrc` and CI, reached the end of its support on 30 April 2026. Each gate was quick, but
there was no one command to run them all.

## D1: clone to running

- **Two builds side by side.** The install fetches a better-sqlite3 build for the installed
  Electron into `node_modules/.cache/astrorepo-native/` (or compiles one when no prebuilt binary
  matches), and the app opens its database with it under Electron. The Node build the tests use is
  never touched, so `npm test` and `npm run dev` both work with no rebuild in between.
- **`npm run doctor`** checks the set-up and prints the command that fixes each problem.
- **`npm run verify`** runs lint, both type checks and the EARS gate side by side, then the tests,
  and lists what failed.
- **Node 22 LTS** in `.nvmrc`, `package.json` engines and every workflow (which read `.nvmrc`).
- `.gitattributes` keeps line endings LF on Windows checkouts; `.editorconfig`; the ESLint config
  is `eslint.config.mjs`, so ESLint no longer warns about the module type on every run.

## D2: faster CI

The audit found that CI ran every gate on both Windows and Ubuntu one after another, kept
superseded runs going, and that the nightly fuzz workflow had never run: GitHub could not parse
it (an unquoted `seed: ` in a `run:` value), so every push recorded a failed run of it instead.

- **One run per change.** CI runs on pull requests and on pushes to main; a newer push to a pull
  request cancels the run it replaces.
- **Each gate once.** Ubuntu runs `npm run verify` (the quick gates side by side, then the tests
  with coverage) and the build. Windows, where the app runs, runs the tests and the build.
- **Workflows that parse.** The fuzz workflow is fixed, and a test parses every workflow.

## D3: smoke, accessibility and screenshots

Unit tests never draw a page, so a page that throws, logs an error or draws blank, and an
accessibility regression, went unseen until someone opened the app.

- **`npm run smoke`** builds nothing itself: after `npm run build` it starts the headless server
  on a free port with an empty data folder, opens every page of the map of places and every
  Settings section in Chromium, in each theme (dark, light, night), and saves a screenshot of
  each to `reports/smoke/<theme>/`, with `reports/smoke/report.json`.
- **It fails** on an uncaught error or console error, a blank main area, or a serious or critical
  axe finding (WCAG 2 A and AA) that `scripts/smoke/axe-baseline.json` does not already hold.
  The baseline holds, per page and rule, how many elements fail at most in any theme, so a new
  failing element on a page with a known finding still fails. It may only shrink: findings fixed
  since are listed, `npm run smoke -- --update-baseline` cuts it down to what still fails and never
  adds to it, and `--accept-findings` writes a run's findings into it on purpose. Slice U4 works it down.
- **Each page is a fresh load**, its theme and route checked, and judged once its loading
  placeholders are gone; the blank-page check reads the page's own content, not its heading.
- **CI** runs it in its own job and keeps the screenshots as an artifact.
- The first run found Settings → Companion screens asking the served app for desktop-only
  channels (two 404s); it now says so without asking.

## D4: demo library

Development, screenshots and docs needed a library with something in it, and only Leigh's own
data had any.

- **`npm run demo`** writes a small made-up library to `.demo/library` (six targets over a year of
  nights: 674 light frames of 64 by 64 pixels with stars, four Siril-style masters, three TIFFs and
  two pictures, all from one Seestar S50), then indexes it into `.demo/data` through the headless
  server: the home folder and site are set, three nights are logged and the library is scanned.
  It takes a few seconds and is the same every time.
- **`npm run demo -- --serve`** keeps serving it at http://127.0.0.1:8090; **`npm run dev:demo`**
  opens it in the desktop app, which in development uses the data folder `ASTRO_DEV_DATA` names (not the server's `ASTRO_DATA`, so a desktop run never shares a running server's database). The builder only clears a folder it made (it leaves a `.astrorepo-demo` marker), never the checkout or its parents, and logs its three nights on their targets after the scan.
- **`npm run smoke -- --demo`** runs the smoke run over a copy of it, with its own baseline
  (`scripts/smoke/axe-baseline.demo.json`) and screenshots in `reports/smoke-demo/`; CI runs both.
- The demo found two faults. A target whose only picture is a TIFF showed a broken image on its
  card, since no browser draws a TIFF; it now shows none. The built-in catalogues fold M 101 into
  M 33 (M 33 carries the alias "Pinwheel Galaxy"), with other conflicting names and coordinates;
  that is its own piece of work, so the demo uses M 81.

## Out of scope

- Upgrading Electron (slice D6). The side-by-side build follows whichever Electron is installed.

## Requirements

| ID | Pattern | Requirement |
|----|---------|-------------|
| DEV-001 | State | While the app runs inside Electron from a development checkout, the system shall open the database with the better-sqlite3 build made for that Electron version, when one is installed beside the Node build. |
| DEV-002 | Event | When dependencies are installed, the system shall fetch, or else compile, the better-sqlite3 build for the installed Electron version into its own folder, leaving the Node build that the tests use untouched. |
| DEV-003 | Unwanted | If the Electron build of better-sqlite3 can be neither fetched nor compiled, then the install shall still succeed and say which command fetches it later. |
| DEV-004 | Event | When `npm run doctor` runs, the system shall check the Node version, the Node and Electron builds of better-sqlite3, the Electron binary and the git hooks, and print each problem with the command that fixes it. |
| DEV-005 | Event | When `npm run verify` runs, the system shall run lint, both type checks, the EARS gate and the tests, run every one even after a failure, and fail when any of them fails. |
| DEV-006 | Ubiquitous | The repository shall name one supported Node LTS major version in `.nvmrc`, which `package.json` engines accepts and every CI workflow reads. |
| DEV-007 | Unwanted | If the database cannot be opened when the app starts, then the system shall show why and, in a development checkout, the command that fixes it, and quit rather than open a blank window. |
| DEV-008 | Event | When a pull request is pushed to, the CI workflow shall run once for it and cancel any run still going for an earlier push to the same pull request. |
| DEV-009 | Ubiquitous | The CI workflow shall run every gate once through `npm run verify`, and the tests and the build on Windows. |
| DEV-010 | Unwanted | If a workflow file cannot be parsed, then the tests shall fail and name the file. |
| DEV-011 | Event | When `npm run smoke` runs after a build, the system shall serve the app with an empty data folder and open every page of the map of places and every Settings section in each theme, saving a screenshot of each. |
| DEV-012 | Unwanted | If a page throws, logs a console error or draws an empty main area during the smoke run, then the run shall fail naming the page and the theme. |
| DEV-013 | Unwanted | If a page fails a serious or critical accessibility rule on more elements than the accessibility baseline holds for it, then the smoke run shall fail naming the page and the rule, list baseline findings that no longer occur, and never add the failure to the baseline when updating it. |
| DEV-014 | Event | When CI runs, the system shall run the smoke run in its own job and keep its screenshots and report as an artifact. |
| DEV-015 | Event | When `npm run demo` runs, the system shall write the same small library every time, laid out as raw, stacked, tif and images by target with a target at each point of the workflow, and index it into its own data folder with a site, logged nights and a library scan. |
| DEV-016 | State | While the desktop app runs from a development checkout with `ASTRO_DEV_DATA` set, the system shall use that folder for its data, and a packaged app shall keep its own. |
| DEV-017 | Event | When CI runs, the system shall build the demo library and run the smoke run over it with its own accessibility baseline, keeping its screenshots beside the empty app's. |
| DEV-018 | Unwanted | If a target's picture is a TIFF, then its card shall show no picture rather than an image the browser cannot draw. |
