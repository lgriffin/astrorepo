# Astrorepo Charter

Astrorepo is a local-first cockpit for everything captured with the Seestar S50 and the Vespera
Pro: it finds every file, shows what is hiding in them, says what each target is ready to become,
and looks ahead through the seasons and the moon from where the scopes stand. This charter is the
Spec Kit constitution: every spec, plan and pull request is checked against it.

The phase-by-phase plan lives in [docs/roadmap.md](../../docs/roadmap.md) and the engineering
guide in [docs/architecture/hexagonal.md](../../docs/architecture/hexagonal.md). Both change in the
same pull request as the code they describe.

## Core Principles

### I. Source data is read-only

The app never moves, renames, modifies or deletes a file inside a folder it indexes. It writes only
to its own database and to a work area it owns. Anything that needs files arranged differently
(for example a Siril run) works on hard links or copies in the work area (ING-001, ING-013).
Nothing the app finds, duplicates included, is deleted by the app; it reports and the user acts.

### II. Discovery and usability come first

The first screen answers two questions: what is hiding in my files, and what should I do next.
Every suggestion states the numbers behind it ("8 h 12 m across 6 nights, never stacked"), links
to where it can be acted on, and can be dismissed until the data changes. Progress on a target is
derived from its files, not typed in. A feature that adds data but no way to find or act on it is
not finished.

### III. Requirements are EARS, and every one is tested (non-negotiable)

Each requirement is one EARS sentence with an ID, kept in `specs/<nnn>/requirements.md`. Every ID
appears in square brackets in the name of at least one test, and `npm run ears` fails the build on
an uncited ID, an unknown citation, a duplicate, or wording that does not match its pattern. Only
requirements a slice is building go into a spec; the blueprint's list is a backlog.

### IV. Hexagonal core, strangler migration

Rules live in `packages/domain` (pure functions, no I/O, no clock), orchestration in
`packages/application` (use cases and the ports they own). Adapters in `src/main/adapters`
implement ports; `src/main/composition.ts` is the only place they meet. Legacy services in
`src/main/services` move into the core one use case at a time behind the same IPC channel. No
rewrite: the app works at every commit.

### V. World-class testing

- Domain and use cases are tested on in-memory adapters from `packages/testkit`, never with
  `vi.mock` of modules.
- Every adapter of a port passes that port's contract suite (`packages/testkit/src/contracts`).
- Production and tests build the schema from one migration source (`src/main/db/migrations.ts`).
- Coverage is a ratchet: domain and application at 95% lines, adapters at 80%, legacy never lower
  than its current floor.
- CI runs lint, both type checks, the EARS gate, tests with coverage and the build on Ubuntu and
  Windows.

### VI. Local hardware, local AI, open source

The Windows PC does all heavy work (Siril, PixInsight, RC Astro). The Synology NAS stores the data
and will host the catalogue and API. The DGX Spark is an enabler that runs local models through
Ollama; everything works when it is off, and no image or prompt leaves the network. Proprietary
tools are called, never bundled. Dependencies are OSI licensed.

### VII. Docs move with the code

A pull request that changes behaviour updates, in the same change: the spec's requirements, this
charter if a principle is affected, the roadmap's status table, and the guide a user or developer
would read to use it. Docs that describe something the code no longer does are bugs.

## Delivery order

Windows desktop app first, then a web UI served from the NAS, then a CLI. All three drive the same
core. Plans (the blueprint and the roadmap) are indicative: each slice starts by questioning its
brief and splitting it if it is more than about two days of work.

## Workflow and quality gates

1. Pick the next slice from `docs/roadmap.md`; write its `specs/<nnn>/requirements.md`.
2. Build it test first through the hexagon ("Moving a service into the core" in the guide).
3. Update the roadmap, guides and, if needed, this charter in the same branch.
4. Open a pull request; CI must be green on Ubuntu and Windows before merge.

## Governance

This charter overrides other practice in the repository. Amendments are made in a pull request
that states what changed and why, and bump the version below: major for a removed or redefined
principle, minor for a new principle or section, patch for wording.

**Version**: 1.0.1 | **Ratified**: 2026-09-29 | **Last Amended**: 2026-09-30
