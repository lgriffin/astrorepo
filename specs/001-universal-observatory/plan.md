# Implementation Plan: Universal Astrophotography Observatory

**Branch**: `001-universal-observatory` | **Date**: 2026-07-15 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `/specs/001-universal-observatory/spec.md`

## Summary

Transform the Messier Catalog manager into a universal astrophotography observatory management system. The application will be an Electron desktop app (React + TypeScript) with local SQLite storage, supporting 20+ astronomical catalogues with cross-catalogue identity resolution, observation session recording, equipment tracking, configurable project workflows, observatory-based observation planning (local ephemeris computation), one-click Siril-compatible folder structure generation, collection management with completion tracking, observatory-wide dashboards, and poster generation for any collection.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js 20 LTS)  
**Primary Dependencies**: Electron, React 18, better-sqlite3, Drizzle ORM, astronomy-engine, Vite  
**Storage**: SQLite (local file, WAL mode) via better-sqlite3 + Drizzle ORM  
**Testing**: Vitest (unit + integration), Playwright (E2E)  
**Target Platform**: Windows 10/11 (primary), macOS and Linux (secondary) via Electron  
**Project Type**: Desktop application (Electron)  
**Performance Goals**: Search <2s over 50K objects, poster render <10s for 500 tiles, folder creation <2s, ephemeris accuracy within 2 minutes of established tools  
**Constraints**: Offline-capable, single-user, local data only, <500MB installer  
**Scale/Scope**: 100K tracked targets, 10K observation sessions, 20+ catalogues with 30K+ pre-loaded objects, 10 key entities, 38 functional requirements, 12 user stories

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

No project constitution has been defined. The constitution template at `.specify/memory/constitution.md` contains only placeholder content. No gates to evaluate.

**Status**: PASS (no gates defined)

**Post-Phase 1 re-check**: PASS (no gates defined)

## Project Structure

### Documentation (this feature)

```text
specs/001-universal-observatory/
├── plan.md              # This file
├── research.md          # Phase 0 output — technology decisions
├── data-model.md        # Phase 1 output — entity definitions
├── quickstart.md        # Phase 1 output — setup guide
├── contracts/           # Phase 1 output — IPC channel contracts
│   └── ipc-contracts.md
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── main/                      # Electron main process (Node.js)
│   ├── index.ts               # App entry, window creation
│   ├── db/                    # Database layer
│   │   ├── schema.ts          # Drizzle schema (all entities)
│   │   ├── migrations/        # SQL migration files
│   │   └── seed/              # Catalogue JSON seed data loaders
│   ├── services/              # Business logic
│   │   ├── target.ts          # Target CRUD, search, merge
│   │   ├── session.ts         # Session recording & queries
│   │   ├── collection.ts      # Collection management & stats
│   │   ├── equipment.ts       # Equipment registry & history
│   │   ├── observatory.ts     # Observatory CRUD, primary selection
│   │   ├── ephemeris.ts       # Visibility computation (astronomy-engine)
│   │   ├── folder.ts          # Folder structure generation
│   │   ├── poster.ts          # Poster rendering coordination
│   │   ├── dashboard.ts       # Aggregate statistics queries
│   │   ├── workflow.ts        # Stage transitions & history
│   │   └── relationship.ts    # Target relationship management
│   └── ipc/                   # IPC channel registrations
│       └── handlers.ts        # Maps IPC channels → service calls
├── renderer/                  # Electron renderer (React + Vite)
│   ├── App.tsx                # Root component + router
│   ├── pages/                 # Route-level components
│   │   ├── Dashboard.tsx
│   │   ├── TargetList.tsx
│   │   ├── TargetDetail.tsx
│   │   ├── SessionForm.tsx
│   │   ├── Collections.tsx
│   │   ├── CollectionDetail.tsx
│   │   ├── Equipment.tsx
│   │   ├── Observatory.tsx
│   │   ├── Planning.tsx
│   │   ├── Poster.tsx
│   │   └── Settings.tsx
│   ├── components/            # Reusable UI components
│   │   ├── common/
│   │   ├── target/
│   │   ├── session/
│   │   ├── collection/
│   │   ├── poster/
│   │   ├── dashboard/
│   │   ├── planning/
│   │   └── equipment/
│   ├── hooks/                 # React hooks wrapping IPC calls
│   └── styles/                # Global styles / Tailwind
└── shared/                    # Shared types (main + renderer)
    └── types.ts               # TypeScript interfaces for all entities

data/
└── catalogues/                # Pre-loaded catalogue JSON seed files

tests/
├── unit/                      # Service-level tests (vitest)
├── integration/               # DB + service tests (vitest + in-memory SQLite)
└── e2e/                       # Full app tests (Playwright)
```

**Structure Decision**: Electron monorepo with main/renderer/shared separation. Main process owns all data access and computation. Renderer is a React SPA communicating exclusively via typed IPC. Shared types ensure compile-time contract alignment without runtime overhead.

## Complexity Tracking

No constitution violations to justify — no gates were defined.
