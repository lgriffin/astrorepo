# AstroRepo

**Universal Astrophotography Observatory Management System**

![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-WAL-003B57?logo=sqlite&logoColor=white)
![License](https://img.shields.io/badge/License-ISC-blue)

Desktop application for managing astronomical targets across any catalogue, recording observation sessions, tracking equipment, planning observations with real-time ephemeris computation, and visualizing collection progress.

It is becoming a local-first observatory cockpit: it shows what is hiding in your FITS files, what each target is ready to become, and what to shoot in the coming nights given the season and the moon. Start with these:

- [Charter](.specify/memory/constitution.md): the principles every change is checked against.
- [Roadmap](docs/roadmap.md): which slices have landed and what comes next.
- [Finding your way around](docs/guides/finding-your-way.md): the sidebar's places and groups, the jobs line under it, and where each task lives.
- [Using the cockpit](docs/guides/cockpit.md): what Home's progress strip, hidden-data card and suggestions mean.
- [Planning ahead](docs/guides/planning.md): seasons, closing windows, new-moon windows and bright-moon choices from your site.
- [Hexagonal core](docs/architecture/hexagonal.md): how code is laid out and how a service moves into the core.

## Features

- **Universal Target Model** -- 22 object types covering galaxies, nebulae, clusters, double stars, asterisms, quasars, dark nebulae, supernova remnants, and custom targets.
- **Multi-Catalogue Support** -- Messier, Caldwell, and Sharpless catalogues built-in. Add any catalogue via a pluggable JSON seed format.
- **Cross-Catalogue Object Identity** -- Automatic deduplication resolves objects across catalogues (M42 = NGC 1976 = Orion Nebula = Sh2-281).
- **Full-Text Search** -- FTS5-powered search with alias fallback for fast lookups by designation, name, or alternate identifier.
- **Observation Session Recording** -- Log sessions with date, seeing conditions, equipment used, and exposure statistics.
- **Configurable Workflow Lifecycle** -- 12 default stages from *planned* through *archived*, customizable per workflow.
- **Equipment Inventory & Usage Analytics** -- Track telescopes, cameras, mounts, and filters with per-item usage history.
- **Observatory Ephemeris** -- Real-time altitude, transit, rise/set computation via astronomy-engine (VSOP87 theory).
- **Tonight's Targets** -- Plan sessions with visibility windows, altitude profiles, transit times, and moon separation filtering.
- **Collections & Progress** -- Group targets into collections with completion tracking and poster views.
- **Target Relationships** -- Model spatial relationships: *contains*, *nearby*, *parent_region*, and more.
- **Safe Ingest** -- Source folders are read-only: Siril prep builds its folders in a work area, rescans read only changed files, unreadable files are quarantined with the reason, and a duplicate check reports copies and reclaimable space without deleting anything.
- **Tool Hub and Post-processing Recipes** -- Settings → Tools finds Siril, Siril_Scripts v2, the RC Astro CLI and Git Bash. Each target's page gives the Siril_Scripts v2 command for its newest stack, with the profile from the object type and coordinates and optics filled in, plus the disk it needs.
- **Job Runner** -- Queue a confirmed stack or post-processing run from a target's page; the Jobs page runs it on the PC like a small CI runner: inside a nightly run window (02:00 to 03:00 by default) while the PC is idle, one at a time at low priority, with a predicted length, a live log, Run now and Cancel.
- **Stacking Plan** -- Before Prep for Siril writes anything: which stock Siril script fits a target's frames and calibration, the disk space it needs stage by stage (after Leigh's Siril space estimator), and whether the work area's disk has room.
- **Project Folder Generation** -- Create imaging project directories from configurable templates (default Siril structure).
- **Observatory Cockpit** -- What is hidden in your files (nights never stacked, subs with no target, orphan calibration, rejected subs), progress derived from your data, and dismissible "ready to stack" and "restack" suggestions.
- **Next Actions** -- One ranked to-do list on Home: tonight's captures (closing seasons first, with hours up, moon distance and goal shortfall) ahead of stacking suggestions.
- **Seasons and Moon Planning** -- From your site: tonight's targets with work left and how close the moon comes, bright-moon filtering for dual-band or narrowband filters, targets whose season closes within 30 days, new-moon windows with the best targets, and a 12-month season table.
- **Home** -- The cockpit: next actions first, then coming nights, hidden data and progress. Totals across sessions, targets and equipment are on Insights.
- **Dark Astronomy UI** -- Tailwind CSS custom palette designed for nighttime use.

## Tech Stack

| Component | Technology | Role |
|-----------|-----------|------|
| Runtime | Electron 33 | Desktop shell |
| UI | React 18 | Component framework |
| Language | TypeScript 5.x | Type safety |
| Database | better-sqlite3 | Local SQLite with WAL mode |
| Queries | Hand-written SQL | One migration source in `src/main/db/migrations.ts` |
| Ephemeris | astronomy-engine | VSOP87 positional computation |
| Validation | Zod | Runtime IPC boundary validation |
| Styling | Tailwind CSS | Utility-first with astro-dark theme |
| Build | Vite / electron-vite | Dev server + bundling |
| Testing | Vitest | BDD test framework |
| Routing | React Router (HashRouter) | Client-side navigation |
| IDs | ULID | Sortable unique identifiers |

## Architecture

The application follows a standard Electron three-process architecture, with a hexagonal core growing inside the main process (`packages/domain`, `packages/application`, `packages/testkit`). See `docs/architecture/` for detailed Mermaid diagrams and `docs/architecture/hexagonal.md` for the core.

- **Main Process** -- Database connection, service layer, and IPC handlers. All incoming IPC calls are validated with Zod schemas before reaching business logic.
- **Preload** -- Exposes a minimal `api.invoke()` bridge via `contextBridge`.
- **Renderer** -- React SPA consuming typed IPC hooks for all data access.

## Project Structure

```
src/
  main/             # Electron main process
    db/              # Database connection, schema, FTS, migrations
    ipc/             # IPC handlers with Zod schemas
    services/        # Business logic (target, session, collection, etc.)
  preload/           # Electron preload scripts
  renderer/          # React application
    components/      # Reusable UI components
    hooks/           # Custom hooks (useIPC)
    pages/           # Route pages
  shared/            # Shared TypeScript types
data/
  catalogues/        # Seed data JSON files (Messier, Caldwell, Sharpless)
tests/               # BDD test suites
docs/
  architecture/      # Mermaid architecture diagrams
specs/               # Feature specifications
```

## Getting Started

### Prerequisites

- Node.js 20 LTS
- npm
- C++ build tools (for better-sqlite3 native compilation):
  - **Windows:** Visual Studio Build Tools
  - **macOS:** Xcode Command Line Tools
  - **Linux:** `build-essential`

### Installation

```bash
git clone <repo-url>
cd astrorepo
npm install
```

### Development

```bash
npm run dev          # Start Electron in dev mode
npm test             # Run tests
npm run lint         # Lint the codebase
npm run build        # Production build
```

## Testing

Tests use Vitest with BDD-style EARS (Easy Approach to Requirements Syntax) patterns:

- **Given/When/Then** structure with explicit Event, Action, Response, and State tracking
- In-memory SQLite for full test isolation, built from the same migrations as the app
- Service-level integration tests covering core business logic
- Every requirement in `specs/*/requirements.md` is cited by ID in a test name; `npm run ears` fails the build otherwise
- Port contract suites run against both the in-memory and SQLite adapters

```bash
npm test
```

## Adding Catalogues

Any catalogue can be added by placing a JSON file in `data/catalogues/` following this format:

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

Coordinates use decimal hours (RA) and decimal degrees (Dec). The `aliases` array drives cross-catalogue identity resolution.

## IPC Validation

All IPC inputs are validated at the boundary between renderer and main process using Zod schemas. Invalid data is rejected with structured errors before reaching the service layer, preventing malformed or unexpected payloads from corrupting application state.

## License

ISC
