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
