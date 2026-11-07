# Contributing to AstroRepo

This is how to get from a fresh clone to a merged slice. The rules in short are in
[CLAUDE.md](CLAUDE.md); the architecture is in [docs/architecture/hexagonal.md](docs/architecture/hexagonal.md);
the tests are explained in [docs/testing/README.md](docs/testing/README.md).

## Set up

### On Windows (the app's home)

1. Install **Node.js 22 LTS**. With [nvm-windows](https://github.com/coreybutler/nvm-windows):
   `nvm install 22` then `nvm use 22`. The exact version is in `.nvmrc`.
2. Install **Git for Windows**. The repo stores text with LF endings (`.gitattributes`), so any
   `core.autocrlf` setting works.
3. Clone and install:

   ```powershell
   git clone https://github.com/lgriffin/astrorepo.git
   cd astrorepo
   npm install
   npm run doctor
   ```

   better-sqlite3 ships a prebuilt Node-API binary that both the tests (Node) and the app
   (Electron) load, so no C++ tools are needed on most machines. `npm run doctor` checks Node, that
   binary under Node and under Electron, Electron and the git hooks, and prints the command that
   fixes each problem it finds.
4. Start the app with `npm run dev`, or over a made-up library with `npm run demo` then
   `npm run dev:demo`.

### On macOS or Linux

The same steps, with `nvm use` reading `.nvmrc`. The app builds and runs for development; the
installer (`npm run dist`) is for Windows.

### Editor

Open the folder in VS Code and accept the recommended extensions (ESLint, Vitest, Tailwind,
EditorConfig). The debug launches in `.vscode/launch.json`:

- **Debug the app (main and renderer)**: starts the app under electron-vite with breakpoints in
  `src/main` and `src/renderer`.
- **Debug the current test file**: runs the open test file under Vitest with breakpoints.

## Before you push

```bash
npm run verify
```

`npm run verify` runs every gate CI runs before the build: lint, both type checks and the EARS gate
side by side, then the tests. `-- --no-test` gives a quick check. The pre-commit hook lints the
staged files. If you changed a page, also run `npm run build` then `npm run smoke` (and
`npm run demo` then `npm run smoke -- --demo`): they open every page in every theme and fail on
errors, blank pages and accessibility findings. If you changed a core file, run
`npm run test:mutation:changed`.

## How a slice is built

Work comes in slices: one behaviour a user can see, built end to end in one pull request.

1. **Scaffold it.**

   ```bash
   npm run new:slice -- --name dark-sites --prefix DSK --title "Dark sites"
   ```

   This creates `specs/047-dark-sites/requirements.md` with an example EARS requirement
   (`DSK-001`), a pure rule in `packages/domain/src/dark-sites.ts`, and a test in
   `packages/domain/test/dark-sites.test.ts` that cites it. It also exports the rule from the
   domain index, and every gate passes on the result. The number is the next free one, or give
   `--spec 047-dark-sites`. It refuses a taken number, a prefix another spec uses, or a file that
   already exists.
2. **Write the requirements.** In the spec, say who asked and in their words, what the slice
   delivers and what it leaves out, then one EARS row per behaviour (Ubiquitous, Event, State,
   Unwanted, Optional, Complex). Every ID needs a test whose title cites it; `npm run ears` fails
   otherwise.
3. **Rules first.** Put the decisions in `packages/domain`, pure and without I/O, and test them
   there (95% line coverage, mutation score of 80% on changed files).
4. **Use cases and ports.** Put orchestration in `packages/application` over ports it declares.
   Each new port gets a contract suite in `packages/testkit/src/contracts`, run on both the
   in-memory fake and the real adapter.
5. **Adapters and wiring.** Put adapters in `src/main/adapters` and wire them in
   `src/main/composition.ts`. Add channels with Zod input checks in `src/main/ipc/schemas.ts` and their handlers in the area's module under `src/main/ipc/channels`. Schema changes
   go in `src/main/db/migrations.ts`.
6. **The page.** Build the renderer with the shared controls in `src/renderer/components/ui`:
   - theme tokens for colour;
   - sentence-case labels;
   - `pressable()` for anything clickable that is not a button or link.

   Put rules the page needs in `src/shared` so they can be tested without a browser.
7. **Docs in the same pull request:**
   - the spec;
   - a row in `docs/roadmap.md`;
   - the guide in `docs/guides/` the change touches;
   - an entry in `CHANGELOG.md`;
   - a line in `docs/architecture/slice-notes.md` saying where the code went.

## Pull requests

- Use one pull request per slice, with requirement IDs in the description.
- CI runs:
  - `npm run verify` and the build on Ubuntu;
  - the tests and the build on Windows;
  - the smoke runs;
  - the mutation gate, when core files changed.
- Every review finding gets an answer on its thread: fixed in a named commit, or why not.
- Keep commits focused; the pull request is squashed on merge.
