# Research: Universal Astrophotography Observatory

**Date**: 2026-07-15  
**Branch**: `001-universal-observatory`

## Technology Stack

### Decision: Electron + React + TypeScript

**Rationale**: Single-user offline-first desktop application with rich UI requirements (poster grids, dashboards, analytics). Electron provides proven desktop packaging, one language across main and renderer processes, and the largest ecosystem for desktop-app tooling. Development velocity on a personal/greenfield project is the primary concern.

**Alternatives considered**:

| Alternative                     | Rejected Because                                                                                         |
|---------------------------------|----------------------------------------------------------------------------------------------------------|
| Python FastAPI + React          | Two-language complexity; Python desktop packaging is fragile and produces 300MB+ installers               |
| Tauri + Rust                    | Superior runtime characteristics (3MB bundle, 30MB RAM) but Rust learning curve slows greenfield velocity |
| Astro SSR + Node.js             | Web-first framework; still needs Electron for desktop, adding indirection without benefit                 |

### Decision: SQLite via better-sqlite3

**Rationale**: Single-user, offline, local data. SQLite handles 100K+ targets and 10K sessions trivially. better-sqlite3 is the fastest synchronous SQLite binding for Node.js, works natively in Electron's main process, and supports WAL mode for concurrent reads.

**Alternatives considered**:

| Alternative     | Rejected Because                                                       |
|-----------------|------------------------------------------------------------------------|
| PostgreSQL      | Overkill for single-user; requires separate server process             |
| LowDB/JSON      | Won't scale to 100K records; no query language                        |
| IndexedDB       | Renderer-only; poor fit for main-process data access patterns          |

### Decision: Drizzle ORM for query layer

**Rationale**: Type-safe SQL queries with zero runtime overhead. Schema-as-code provides migration support and compile-time type checking. Lighter than Prisma, works synchronously with better-sqlite3.

### Decision: astronomy-engine for ephemeris

**Rationale**: Pure JavaScript implementation using VSOP87 theory. Positional accuracy to ~1 arcminute, translating to rise/set errors well under 1 minute — comfortably within the 2-minute tolerance specified in SC-011. No native dependencies, runs directly in Electron's main process.

**Alternatives considered**:

| Alternative | Rejected Because                                                                            |
|-------------|---------------------------------------------------------------------------------------------|
| astropy     | Gold-standard accuracy but requires Python runtime; two-language stack adds deployment burden |
| stellarium-web-engine | WASM-based, complex integration, overkill for planning calculations             |

### Decision: Vitest for testing

**Rationale**: Fast, TypeScript-native test runner with built-in mocking. Compatible with the Vite-based build pipeline that Electron + React typically uses.

### Decision: Electron Forge for packaging

**Rationale**: Official Electron tooling for building, packaging, and distributing. Supports Windows (primary target), macOS, and Linux. Handles code signing, auto-update, and installer generation.

## Astronomical Computation Scope

### Rise/Set/Transit Calculations

astronomy-engine provides:
- `SearchRiseSet()` — rise and set times for any RA/Dec from a given location
- `SearchHourAngle()` — transit time (hour angle = 0)
- `Horizon()` — altitude and azimuth at any time
- `MoonPhase()` — lunar phase angle
- `AngleFromSun()` / `Elongation()` — angular separation

These cover all planning metrics in FR-035:
- Rise time, set time: `SearchRiseSet()`
- Transit time and altitude: `SearchHourAngle()` + `Horizon()`
- Current altitude and azimuth: `Horizon()`
- Best imaging window: computed from rise/set/transit + twilight
- Hours above minimum horizon: iterative `Horizon()` sampling
- Moon separation: `AngleFromSun()` adapted for moon-target angle

### Twilight Calculation

Astronomical twilight (sun at -18 degrees) defines the imaging window. astronomy-engine's `SearchAltitude()` can find twilight boundaries.

## Catalogue Data Strategy

### Pre-loaded Data Format

Catalogue data will be bundled as JSON seed files, loaded into SQLite on first run or schema migration. Sources:

- **Messier**: 110 objects, well-documented, publicly available
- **NGC/IC**: VizieR NGC/IC catalogue (~13,000 objects)
- **Sharpless**: 313 HII regions
- **Caldwell**: 109 objects (subset of NGC/IC with Caldwell designations)
- **Barnard**: 349 dark nebulae
- **Abell PN**: ~86 planetary nebulae
- **Abell Clusters**: ~4,073 galaxy clusters
- **Others** (PGC, UGC, Melotte, Collinder, Trumpler, PK, RCW, Gum, vdB, LDN, LBN): VizieR sources

Cross-references between catalogues will be established using coordinate matching (within angular tolerance) and known alias databases.

### Identity Resolution

Object identity will use a layered approach:
1. Exact catalogue designation match (e.g., "M42" → known target)
2. Common name lookup (e.g., "Orion Nebula" → M42)
3. Cross-catalogue reference lookup (e.g., "NGC 1976" → same target as M42)
4. Coordinate proximity match as fallback (within configurable angular radius)

## Folder Structure Generation

The system will use a template engine for folder creation:
- Templates stored as JSON describing the directory tree
- Default Siril template: `{ "lights": {}, "darks": {}, "biases": {}, "flats": {} }`
- Custom templates follow the same schema with arbitrary nesting
- Target name sanitisation: replace invalid filesystem characters with underscores, preserve original name in database

## Poster Rendering

Poster generation will use HTML Canvas or SVG rendered in the Electron renderer process:
- Grid layout computed from collection size
- Tiles rendered with image thumbnails (from referenced files) or placeholder graphics
- Export to PNG/PDF for printing
- Responsive tile sizing based on collection count (e.g., 10x11 for Messier 110)
