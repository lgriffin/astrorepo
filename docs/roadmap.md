# Roadmap

The cockpit blueprint (September 2026) split the modernisation into vertical slices A to M. This
page tracks what has landed, in what spec, and what comes next. It is updated in the same pull
request as each slice, so it always matches `main`. The plan is indicative: slices are reshaped
when the code says otherwise, and the reasons are recorded here.

## Status

| Slice | What you can see | Spec | Status |
|---|---|---|---|
| A · Walking skeleton | Hexagonal core, EARS gate, "ready to stack" and "restack" suggestions on the dashboard | [009](../specs/009-baseline-architecture/requirements.md) | Done (PR #14) |
| C1 · Discovery cockpit | Hidden-data card, progress strip, "What the files say" on each target, dismissible suggestions, one migration source | [010](../specs/010-discovery-cockpit/requirements.md) | Done |
| B · Ingest core | Read-only indexing, content hashes, duplicates, quarantine, fast rescans | 011 | Next |
| L · Seasons, moon and tonight | Sites, 12-month season view, closing-season warnings, new-moon windows, bright-moon filtering | 012 | Planned |
| C2 · Ranked cockpit | Suggestions ranked by unprocessed hours, season left and coming nights | 013 | Planned |
| C3 · Recipes | Siril recipe library, "what could I build", confirm before run | later | Planned |
| G · Jobs and Siril runner | A recipe runs on the Windows PC with a live log | later | Planned |
| D, E, F, H, I, J, K, M | Sky geometry, Seestar and Vespera adapters, gallery, store parity, poster, NAS deploy, describe-a-capture | later | Backlog |

## Changes to the blueprint

- **Slice C is split in three.** Discovery (what is there) needs nothing but the index, so it
  landed first. Ranking needs seasons and the moon (slice L), and recipes need the job runner
  (slice G) to be worth a Run button, so they follow those.
- **Duplicates moved from DSC-006 to ingest.** Finding duplicate bytes needs content hashes, which
  slice B adds.
- **One migration source landed early** (NFR-008, from slice I) because every new table would
  otherwise be written twice.
- **Postgres, GraphQL and pnpm workspaces wait** until a second app (the NAS core-api) needs the
  packages. Until then the core runs inside the Electron main process over SQLite, which keeps the
  app shippable at every step.

## Open questions for Leigh

- One night from each scope (a Seestar folder and a Vespera export, with firmware versions), so
  the scope adapters can be built from real files.
- The Synology model, which decides the container image targets.
- Where RC Astro runs today (assumed: inside PixInsight on the Windows PC).
- Two or three Siril scripts you trust, to become the first recipes.
