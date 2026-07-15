# Quickstart: Universal Astrophotography Observatory

**Date**: 2026-07-15  
**Branch**: `001-universal-observatory`

## Prerequisites

- Node.js 20+ (LTS)
- npm 10+
- Git
- Windows 10/11 (primary), macOS or Linux (secondary)

## Setup

```bash
# Clone and install
git clone <repo-url>
cd astrorepo
npm install

# Start in development mode (hot-reload)
npm run dev

# Run tests
npm test

# Build for production
npm run build

# Package as installer
npm run package
```

## Project Structure

```
astrorepo/
├── src/
│   ├── main/                  # Electron main process
│   │   ├── index.ts           # App entry point
│   │   ├── db/                # SQLite schema, migrations, seed data
│   │   │   ├── schema.ts      # Drizzle schema definitions
│   │   │   ├── migrations/    # SQL migration files
│   │   │   └── seed/          # Catalogue JSON seed data
│   │   ├── services/          # Business logic
│   │   │   ├── target.ts      # Target CRUD, search, merge
│   │   │   ├── session.ts     # Session recording
│   │   │   ├── collection.ts  # Collection management
│   │   │   ├── equipment.ts   # Equipment registry
│   │   │   ├── observatory.ts # Observatory locations
│   │   │   ├── ephemeris.ts   # Visibility computation
│   │   │   ├── folder.ts      # Folder structure generation
│   │   │   ├── poster.ts      # Poster rendering
│   │   │   ├── dashboard.ts   # Aggregate statistics
│   │   │   └── workflow.ts    # Stage transitions
│   │   └── ipc/               # IPC channel handlers
│   │       └── handlers.ts    # Maps IPC channels to services
│   ├── renderer/              # Electron renderer (React)
│   │   ├── App.tsx            # Root component + routing
│   │   ├── pages/             # Top-level page components
│   │   │   ├── Dashboard.tsx
│   │   │   ├── TargetList.tsx
│   │   │   ├── TargetDetail.tsx
│   │   │   ├── SessionForm.tsx
│   │   │   ├── Collections.tsx
│   │   │   ├── CollectionDetail.tsx
│   │   │   ├── Equipment.tsx
│   │   │   ├── Observatory.tsx
│   │   │   ├── Planning.tsx
│   │   │   ├── Poster.tsx
│   │   │   └── Settings.tsx
│   │   ├── components/        # Reusable UI components
│   │   │   ├── common/        # Buttons, inputs, tables, modals
│   │   │   ├── target/        # Target cards, search, type badges
│   │   │   ├── session/       # Session list, detail, form fields
│   │   │   ├── collection/    # Collection cards, progress bars
│   │   │   ├── poster/        # Poster grid, tile renderer
│   │   │   ├── dashboard/     # Stat cards, charts, progress
│   │   │   ├── planning/      # Visibility chart, night planner
│   │   │   └── equipment/     # Equipment cards, usage history
│   │   ├── hooks/             # React hooks for IPC calls
│   │   └── styles/            # Global CSS / Tailwind config
│   └── shared/                # Types shared between main & renderer
│       └── types.ts           # TypeScript interfaces for all entities
├── data/
│   └── catalogues/            # Pre-loaded catalogue JSON files
├── tests/
│   ├── unit/                  # Service-level tests
│   ├── integration/           # Database + service integration
│   └── e2e/                   # Playwright end-to-end tests
├── electron-builder.yml       # Packaging configuration
├── package.json
├── tsconfig.json
├── vite.config.ts             # Vite config for renderer
└── drizzle.config.ts          # Drizzle ORM config
```

## Key Development Workflows

### Adding a new catalogue

1. Create a JSON seed file in `data/catalogues/<catalogue-name>.json`
2. Format: array of `{ designation, ra_hours, dec_degrees, object_type, common_names?, cross_refs? }`
3. Add catalogue entry in `src/main/db/seed/catalogues.ts`
4. Run `npm run seed` to load into database

### Adding a new folder template

1. Add template definition in `src/main/db/seed/templates.ts`
2. Structure is a nested JSON object where keys are directory names and values are sub-trees

### Running ephemeris calculations

The ephemeris service wraps astronomy-engine. Key functions:
- `getVisibility(ra, dec, observer, date)` — returns full visibility data
- `getTonightTargets(observer, date, targets)` — returns ranked list for a night

### Database migrations

```bash
# Generate migration from schema changes
npm run db:generate

# Apply pending migrations
npm run db:migrate

# Reset and reseed (development only)
npm run db:reset
```

## Testing Strategy

- **Unit tests**: Service functions with mocked database (vitest)
- **Integration tests**: Service functions with real SQLite in-memory database (vitest)
- **E2E tests**: Full application flow via Playwright
- **Ephemeris tests**: Compare computed values against known astronomical almanac data
