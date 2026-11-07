# 045 Developer experience: requirements

Leigh asked (7 November 2026): "Can you do both a DX and a UX overhaul for the system." The plan
splits the developer side into slices D1 to D6 (the plan doc is linked from `docs/roadmap.md`).
This spec holds the IDs of the slices built so far; later slices add theirs when they start.
D7, the Electron upgrade, followed once Leigh answered the plan doc's question on the version.

An audit on 7 November 2026 found that a fresh clone could not start the app: `npm install`
builds better-sqlite3 for Node, which the tests need, while Electron embeds a different Node and
refuses that build (NODE_MODULE_VERSION 127 against 130), and nothing built one for Electron. Node 20,
pinned in `.nvmrc` and CI, reached the end of its support on 30 April 2026. Each gate was quick, but
there was no one command to run them all.

## D1: clone to running

- **Two builds side by side** (until D7). The install fetched a better-sqlite3 build for the
  installed Electron into `node_modules/.cache/astrorepo-native/`, and the app opened its database
  with it under Electron, so `npm test` and `npm run dev` both worked with no rebuild in between.
  D7 replaced this with one build that both load.
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

## D5: contributor path

Starting work meant reading an 89-line CLAUDE.md, most of it notes on past slices, and copying
an earlier spec, domain file and test by hand. Nothing said how to set up on Windows or what to
run before a push, and the repo ignored any shared editor set-up.

- **CONTRIBUTING.md** covers setting up on Windows (Node from `.nvmrc`, `npm run doctor`), macOS
  and Linux, the editor, what to run before a push, how a slice is built step by step, and what a
  pull request needs. The README links it.
- **`npm run new:slice -- --name dark-sites --prefix DSK --title "Dark sites"`** writes
  `specs/<next number>-dark-sites/requirements.md` with an example Unwanted requirement `DSK-001`,
  a pure rule in `packages/domain/src/dark-sites.ts` exported from the domain index, and a test
  citing `DSK-001`. Every gate passes on what it writes. It refuses a taken spec number, a prefix
  another spec uses, a malformed name or prefix, or a file already there, and writes nothing.
- **CLAUDE.md holds the rules only**: technologies, structure, commands and the rules the gates
  enforce. Past slices' notes (where each put its code) moved to
  `docs/architecture/slice-notes.md`, which each slice now adds a line to.
- **VS Code**: shared settings (the workspace TypeScript, ESLint fixes on save, LF), recommended
  extensions (ESLint, Vitest, Tailwind, EditorConfig) and debug launches for the app's main
  process and renderer together and for the open test file. Git keeps these three files and
  still ignores the rest of `.vscode/`.

## D6: code health

The renderer was one 1.16 MB script read in full before Home could show. The IPC handlers were
one 1,077-line function and the shared types one 2,377-line file, so every change touched the
same two files. Vitest was a major behind, and nothing proposed dependency updates.

- **Pages load when opened.** Home comes with the app; every other page is loaded the first time
  it is opened, with a loading line while it comes. A page that cannot be loaded (from an older
  build, or on a companion screen that lost the PC) says so with **Reload**, never a blank screen.
  The script read at start fell to 491 kB.
- **One module per area.** The channels are registered from `src/main/ipc/channels/` (targets,
  sessions, settings, FITS, library, Vespera, gallery, insights, sky, workspaces), with
  `validated` and the helpers they share beside them. The shared types are in
  `src/shared/types/`, one file per area, and `src/shared/types.ts` re-exports them, so imports
  are unchanged. None is over 600 lines.
- **Vitest 3.** Vitest and its coverage moved to 3.2. Vitest 3 does not load a file outside the
  project, so the scaffolder's test writes its rule under `node_modules/.cache`.
- **Dependabot.** Weekly grouped pull requests for npm (Electron, testing, lint and types, build,
  and minor and patch runtime updates) and for the workflows' actions. An Electron major is never
  proposed: it moves the app's runtime and the native build, so it is a planned change.

## D7: Electron 45

Leigh had no preference on the version (7 November 2026), so the app moves to the newest stable
major, Electron 45 (from 33). better-sqlite3 13 is a Node-API module with its prebuilt binaries
inside the package, and a Node-API binary loads in any Node or Electron, so the side-by-side build
of D1 is no longer needed:

- **One build.** The app and the tests open their databases with the binary npm installs. The
  install step, `npm run native:electron` and the Electron build folder are gone.
- **`npm run doctor`** loads that binary in the installed Electron, and says to run
  `npm rebuild better-sqlite3` if it will not load.
- A test loads better-sqlite3 in the installed Electron, which CI installs on Ubuntu and Windows.
- Dependabot still leaves Electron majors to a planned change like this one.

Retired: DEV-002 (fetch or compile an Electron build on install) and DEV-003 (an install that
still succeeds when that fails), since there is no second build. DEV-001 now says one build serves
both, and DEV-004 checks that build under Electron.

## Requirements

| ID | Pattern | Requirement |
|----|---------|-------------|
| DEV-001 | Ubiquitous | The app under Electron and the tests under Node shall open their databases with the one better-sqlite3 build that npm installs, with no build or install step for Electron alone. |
| DEV-004 | Event | When `npm run doctor` runs, the system shall check the Node version, that better-sqlite3 loads under Node and under Electron, the Electron binary and the git hooks, and print each problem with the command that fixes it. |
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
| DEV-019 | Event | When `npm run new:slice` runs with a name, an ID prefix and a title, the system shall write a spec with an EARS requirement, a pure domain rule exported from the domain index and a test citing that requirement, numbering the spec after the highest existing one unless a number is given. |
| DEV-020 | Unwanted | If the spec number or ID prefix is already used, the name or prefix is malformed, a flag is missing or a file to write already exists, then `npm run new:slice` shall write nothing and say why. |
| DEV-021 | Ubiquitous | The repository shall have a CONTRIBUTING.md covering set-up on Windows, the gates to run before a push and how a slice is built, and shall keep CLAUDE.md to the rules, with notes on past slices in `docs/architecture/slice-notes.md`. |
| DEV-022 | Ubiquitous | The repository shall share VS Code settings, recommended extensions and debug launches for the main process with the renderer and for a test file, kept by git while the rest of `.vscode/` stays ignored. |
| DEV-023 | Ubiquitous | The renderer shall load Home with the app and every other page the first time it is opened, showing that it is loading meanwhile, and shall say a page could not be loaded and offer to reload rather than show a blank screen. |
| DEV-024 | Ubiquitous | The IPC channels and the shared types shall each be split into one module per area, none over 600 lines, registered and re-exported from the files that held them. |
| DEV-025 | Ubiquitous | The tests shall run on Vitest 3 with its coverage on the same major, and mutation testing shall run on it. |
| DEV-026 | Event | When a week passes, Dependabot shall propose grouped updates for npm and the workflows' actions, and shall not propose an Electron major. |
| DEV-027 | Ubiquitous | The desktop app shall run on Electron 45, and Dependabot shall leave Electron majors to a planned change. |
