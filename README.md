# AstroRepo

**A local-first observatory cockpit for astrophotography on Windows**

![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-WAL-003B57?logo=sqlite&logoColor=white)
![Version](https://img.shields.io/badge/version-0.2.0-blue)

AstroRepo is a desktop app that sits on top of the astrophotography data you already have. It reads
your FITS and camera RAW files where they are, shows what is hiding in them, tells you what each
target is ready to become and what to shoot in the coming nights, and drives the tools you already
use (Siril, Siril_Scripts, RC Astro, SyQon and ASTAP) as a small queue of jobs on your own PC. Your
source folders are never renamed or changed.

It was built first for a Seestar S50 and Vaonis rig stacking with Siril, and it also handles DSLR
and mirrorless RAW, mono cameras with filter wheels, and comets for anyone who shoots those.

## Contents

- [What it does](#what-it-does)
- [Tools it works with](#tools-it-works-with)
- [Getting started](#getting-started)
- [Documentation](#documentation)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Engineering standards](#engineering-standards)
- [Adding catalogues](#adding-catalogues)
- [Licence](#licence)

## What it does

The app follows one loop: find what you have, plan what to shoot, check what you shot, stack it,
process it, and archive it. Each step is a place in the sidebar or a step on a target's page.

### Discover what your files hold

- **Library scan.** Walks your folders a small piece at a time with live counts, can be cancelled
  and carries on where it stopped. Rescans read only changed files, unreadable files are
  quarantined with the reason, and a sampled SHA-256 check reports duplicates and reclaimable space
  without deleting anything.
- **Hidden data.** Nights never stacked, subs with no target, orphan calibration and rejected subs,
  with progress per target worked out from the data rather than typed in.
- **Next actions.** One ranked list on Home: tonight's captures, closing seasons first, ahead of
  "ready to stack" and "restack" suggestions you can dismiss.
- **Get set up.** A checklist on Home until your site, home folder, a first scan and Siril are in
  place, plus any missing tool catalogue.

### Plan the coming nights

- **Seasons and moon.** From your site: tonight's targets with work left and how close the moon
  comes, targets whose season closes within 30 days, new-moon windows with their best targets and
  a 12-month season table. Bright-moon filtering knows dual-band and narrowband filters, including
  the Seestar's LP filter.
- **Sky planner.** Altitude, transit and rise and set times from astronomy-engine, plus a mosaic
  planner that proposes tiles with at least 15% overlap, the hours each needs and the nights every
  panel is up, with CSV export.
- **Filter to shoot.** On a filter-wheel target, tonight's plan names the filter that suits the
  moon and the channel that lags.

### Check what you shot

- **Frame grading.** Every light measured for FWHM, eccentricity, star count, background, noise
  and SNR, graded against limits in Settings and against its own night, kept or rejected by hand,
  and exported as CSV. Only kept lights go to Siril.
- **Plate solving.** ASTAP, or Siril's own solver when ASTAP is not installed, solves one light per
  folder per night and every master as a background job. Each target shows where its files point,
  warns when they may be filed under the wrong name and shows the rotation by night. Solved lights
  are grouped into a mosaic's panels.
- **Inspector.** Opening a file shows its histogram per channel, noise, clipping, the brightest
  star's FWHM and profile, and a preview with a coordinate grid and Messier, NGC and IC labels.
  Two masters or finished images can be compared side by side or with a slider.

### Stack and process

- **Stacking plan.** Before anything is written: which stock Siril script fits a target's frames
  and calibration, the disk space it needs stage by stage, memory against your PC's, and advice on
  drizzle, rejection and why calibration frames do or do not match.
- **Provenance.** Stacks run a step at a time and resume after the app closes. A result is
  published only when every step succeeded, with a manifest beside it naming the script, steps and
  every frame, and each target's runs read as a timeline.
- **Post-processing.** Each target's page gives the Siril_Scripts v2 command for its stack with the
  profile, coordinates and optics filled in, SyQon steps (star separation, sharpening, denoise and
  gradient removal) for the models your account may use, and palette suggestions from its filters.
- **Job runner.** Stack, solve and post-processing runs queue like a small CI runner: inside a
  nightly run window (02:00 to 03:00 by default) while the PC is idle, one at a time at low
  priority, with a predicted length, a live log, Run now and Cancel.
- **Archive.** A finished target is archived linked to its raw frames on the NAS or self-contained,
  after showing each work folder's size and what removing it frees. Nothing is removed unless you
  tick it.

### Other rigs

- **Camera RAW.** CR2, NEF, ARW, DNG and other TIFF-based RAW indexed from its tags, with ISO as
  gain, and stacked with Siril's colour script. CR3 and RAF are listed but not read yet.
- **Mono with filters.** Lights stacked one filter at a time in their own work folders, with flats
  checked per filter and each channel's master listed.
- **Comets.** The orbit comes from a Minor Planet Center line, and the app writes the positions
  file Siril needs to register on the comet.

None of these shows for a Seestar or Vespera target.

### Still from the original app

Targets across Messier, Caldwell, NGC, IC and Sharpless with cross-catalogue identity (M42 = NGC
1976 = Sh2-281), full-text search, observation sessions, equipment and its usage, collections
with progress and a poster view, and a dark interface meant for use at night.

## Tools it works with

AstroRepo never bundles these tools. It finds the ones you installed and calls their command
lines through one hub (Settings → Tools), which shows each tool's version and whether the
catalogues it needs are there.

| Tool | Used for | Needed? |
|---|---|---|
| [Siril](https://siril.org) | Stacking with its stock scripts, plate solving when ASTAP is missing, comet registration | Yes, for stacking |
| [Siril_Scripts](https://github.com/lgriffin/Siril_Scripts) v2 | Post-processing recipes, run from where you installed them | Optional |
| [RC Astro](https://www.rc-astro.com) stand-alone tools | BlurXTerminator, NoiseXTerminator and StarXTerminator steps | Optional |
| [SyQon Studio](https://syqon.eu) CLI | Star separation, sharpening, denoise and gradient removal | Optional |
| [ASTAP](https://www.hnsky.org/astap.htm) with a star database | Plate solving (preferred over Siril's solver) | Optional |
| Git Bash | Running Siril_Scripts' shell scripts on Windows | With Siril_Scripts |

One exit-code contract explains how each tool's run ended. Tool output parsing (ASTAP and Siril
solve results, SyQon flags and model names, RC Astro model file names) follows the tools'
documentation and still needs checking against real installs before 1.0.0.

## Getting started

### Prerequisites

- Windows 10 or 11 (the app is Windows first; it builds on macOS and Linux for development)
- Node.js 20 LTS and npm
- C++ build tools for better-sqlite3: Visual Studio Build Tools on Windows, Xcode Command Line
  Tools on macOS, `build-essential` on Linux

### Install and run

```bash
git clone https://github.com/lgriffin/astrorepo.git
cd astrorepo
npm install
npm run dev
```

On first run, follow Get set up on Home: set your site in Settings → Your site, choose your home
folder, scan your library and point Settings → Tools at Siril.

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the app in development mode |
| `npm test` | Run every test once |
| `npm run lint` | Lint `src`, `tests`, `packages` and `scripts` |
| `npm run typecheck` / `npm run typecheck:tests` | Type-check the app and the tests |
| `npm run ears` | Fail when an EARS requirement has no test naming it |
| `npm run build` | Production build |
| `npm run dist` | Build and package the Windows installer with Electron Forge |
| `npm run db:seed` / `npm run db:reset` | Load or reload the catalogue seed data |

## Documentation

- [Charter](.specify/memory/constitution.md): the principles every change is checked against.
- [Roadmap](docs/roadmap.md): which slices have landed, what comes next, and the open questions.
- [Changelog](CHANGELOG.md): what each release holds.
- Guides:
  - [Finding your way around](docs/guides/finding-your-way.md): the sidebar's places, the jobs
    line under it, and where each task lives.
  - [Using the cockpit](docs/guides/cockpit.md): Home, a target's page, stacking, tools, jobs,
    grading, plate solving, the inspector and other rigs.
  - [Planning ahead](docs/guides/planning.md): seasons, closing windows, new-moon windows and
    bright-moon choices from your site.
- Architecture:
  - [C4 model](docs/architecture/c4.md): context, containers and components.
  - [Hexagonal core](docs/architecture/hexagonal.md): how code is laid out and how a service
    moves into the core.
  - [Data model](docs/architecture/data-model.md), [IPC flow](docs/architecture/ipc-flow.md) and
    the other diagrams in [docs/architecture](docs/architecture).
- Specs: each slice's EARS requirements live in `specs/<nnn>-<name>/requirements.md`.

| Spec | Slice |
|---|---|
| [009](specs/009-baseline-architecture/requirements.md) | Baseline architecture |
| [010](specs/010-discovery-cockpit/requirements.md) | Discovery cockpit |
| [011](specs/011-ingest-core/requirements.md) | Ingest core |
| [012](specs/012-seasons-moon/requirements.md) | Seasons, moon and tonight |
| [013](specs/013-ranked-cockpit/requirements.md) | Ranked cockpit |
| [014](specs/014-siril-space/requirements.md) | Stacking plan and disk space |
| [015](specs/015-tool-hub/requirements.md) | Tool hub and post-processing recipes |
| [016](specs/016-job-runner/requirements.md) | Job runner |
| [017](specs/017-unified-ux/requirements.md) | Unified experience |
| [018](specs/018-gentle-scan/requirements.md) | Gentle scan |
| [019](specs/019-frame-grading/requirements.md) | Frame grading |
| [020](specs/020-stacking-advice/requirements.md) | Stacking advice |
| [021](specs/021-provenance/requirements.md) | Provenance |
| [022](specs/022-archive/requirements.md) | Archive |
| [023](specs/023-hub-syqon/requirements.md) | Hub: SyQon CLI and tool health |
| [024](specs/024-sky-geometry/requirements.md) | Sky geometry |
| [025](specs/025-gallery-inspector/requirements.md) | Gallery inspector |
| [026](specs/026-other-rigs/requirements.md) | Other rigs |

## Architecture

AstroRepo is an Electron app with a hexagonal core growing inside its main process. The
[C4 model](docs/architecture/c4.md) draws it at three levels, and
[hexagonal.md](docs/architecture/hexagonal.md) explains the rules.

- **Domain** (`packages/domain`): pure rules with no I/O, such as frame grading, stacking plans,
  sky geometry, palettes, comet orbits and camera RAW tags.
- **Application** (`packages/application`): use cases and the ports they need, such as the frame
  catalogue, Siril workspace, tool hub, jobs, plate solvers, gallery and archive.
- **Adapters** (`src/main/adapters`): SQLite, file system, process and Windows implementations of
  those ports, wired together in `src/main/composition.ts`.
- **Testkit** (`packages/testkit`): in-memory fakes and the contract suites every adapter of a
  port must pass.
- **Main process** also hosts the job runner (`src/main/jobs-host.ts`), worker threads for
  measuring and inspecting images, and IPC handlers that validate every input with Zod.
- **Preload** exposes a minimal `api.invoke()` bridge, and the **renderer** is a React app whose
  sidebar, page titles and back links all come from one map in `src/shared/navigation.ts`.

| Component | Technology |
|---|---|
| Desktop shell | Electron 33 |
| UI | React 18, React Router, Tailwind CSS |
| Language | TypeScript 5.x |
| Database | better-sqlite3 (WAL), hand-written SQL, one migration source in `src/main/db/migrations.ts` |
| Ephemeris | astronomy-engine |
| Validation | Zod at the IPC boundary |
| Build | electron-vite, Electron Forge |
| Testing | Vitest with v8 coverage |

## Project structure

```
packages/
  domain/            # Pure rules and their tests
  application/       # Ports, use cases and their tests
  testkit/           # Fakes and port contract suites
src/
  main/
    adapters/        # Port implementations (SQLite, Node, Windows)
    composition.ts   # Wires adapters into use cases
    db/              # Connection, migrations, seed data loading
    fits/            # FITS and PNG reading, measuring, previews
    raw/             # Camera RAW (TIFF/EXIF) reading
    workers/         # Worker threads for measuring and inspecting
    ipc/             # IPC handlers with Zod schemas
    services/        # Older services, moving into the core over time
    jobs-host.ts     # The job runner
  preload/           # The api.invoke() bridge
  renderer/          # React pages and components
  shared/            # Types and the navigation map shared by both sides
data/catalogues/     # Messier, Caldwell, NGC, IC and Sharpless seed data
specs/               # Feature specs with EARS requirements
docs/                # Roadmap, guides and architecture
scripts/ears/        # The EARS traceability gate
tests/               # Unit, integration, contract and architecture tests
```

## Engineering standards

- **EARS requirements.** Every behaviour is written as an EARS requirement in its spec, and every
  requirement ID is cited in a test title, as in `[RIG-019] Given ... When ... Then ...`.
  `npm run ears` fails the build when one is missing, unknown or duplicated.
- **Contract suites.** Each port has one suite in `packages/testkit` that both the in-memory fake
  and the real adapter must pass.
- **Coverage floors.** The domain and application packages are held at 95% lines and functions
  and 90% branches, adapters at 80%, and older services at a ratchet that only goes up.
- **Architecture tests.** `tests/architecture` checks that the domain imports only itself and the
  application only itself and the domain, so no framework or I/O reaches the core.
- **Docs in the same change.** A behaviour change updates its spec, the roadmap, the relevant
  guide, the C4 diagrams when a port, adapter or tool is added, and the changelog in the same pull
  request.
- **Plain words.** Interface labels are in sentence case, checked by `tests/unit/wording.test.ts`.
- **CI.** Lint, type checks, the EARS gate, tests with coverage and the build run on Windows and
  Ubuntu for every pull request.

## Adding catalogues

Add a catalogue by placing a JSON file in `data/catalogues/`:

```json
{
  "catalogue": {
    "name": "Messier",
    "abbreviation": "M",
    "description": "Charles Messier's catalogue of nebulae and star clusters",
    "totalObjects": 110
  },
  "objects": [
    {
      "designation": "M1",
      "name": "Crab Nebula",
      "type": "supernova_remnant",
      "ra": 5.575,
      "dec": 22.017,
      "mag": 8.4,
      "size": 6.0,
      "constellation": "Taurus",
      "aliases": ["NGC 1952", "Sh2-244"]
    }
  ]
}
```

RA is in decimal hours and Dec in decimal degrees. The `aliases` array drives cross-catalogue
identity.

## Licence

There is no LICENSE file yet. The project aims to be open source, and the licence is being
settled in [#32](https://github.com/lgriffin/astrorepo/issues/32) before 1.0.0.
