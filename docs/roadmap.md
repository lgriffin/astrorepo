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
| B · Ingest core | Siril prep in a work area (sources untouched), fast rescans, quarantine of unreadable files, duplicate check | [011](../specs/011-ingest-core/requirements.md) | Done |
| L · Seasons, moon and tonight | Coming-nights card, 12-month season table, closing-season warnings, new-moon windows, bright-moon filtering | [012](../specs/012-seasons-moon/requirements.md) | Done |
| C2 · Ranked cockpit | Next actions: tonight's captures (closing seasons first) ranked ahead of stacking; other checks in their own section | [013](../specs/013-ranked-cockpit/requirements.md) | Done |
| C3a · Stacking plan | Which stock Siril script fits a target's frames, the disk space it needs stage by stage, and whether the work area has room | [014](../specs/014-siril-space/requirements.md) | Done |
| C3b · Tool hub and post-processing recipes | Settings > Tools finds Siril, Siril_Scripts, RC Astro and Git Bash; each target's page gives the Siril_Scripts v2 command for its stack (profile, coordinates and optics filled in) and the disk it needs | [015](../specs/015-tool-hub/requirements.md) | Done |
| G · Job runner | A small CI-like queue on the Windows PC: stack and post-processing runs start in a nightly run window while the PC is idle, one at a time at low priority, with predicted length, live logs, Run now and Cancel | [016](../specs/016-job-runner/requirements.md) | Done |
| U1 · One map (UX overhaul) | Sidebar grouped into the four daily places plus Files, Review, Collections and Setup; one name per place; back links on detail pages; jobs status on every page; links open the Settings section they name | [017](../specs/017-unified-ux/requirements.md) | Done (PR #22) |
| U2 · Home first (UX overhaul) | Home opens on Next actions, then Coming nights and hidden data, then progress; totals move to Insights; a stacking suggestion already queued in Jobs says so; one shared card and empty state | [017](../specs/017-unified-ux/requirements.md) | Done (PR #27) |
| U3 · A target in one flow (UX overhaul) | A target's page in four parts (Overview, Stack and process, Files, Notes and nights); stack, post-process and runs as numbered steps that say when a job is already queued; suggestions and jobs open the target at Stack and process | [017](../specs/017-unified-ux/requirements.md) | Done (PR #28) |
| U4 · Setup once (UX overhaul) | The site set only in Settings; a Get set up checklist on Home until the site, home folder, a scan and Siril are there; empty pages link to the step that fills them | [017](../specs/017-unified-ux/requirements.md) | Done |
| U5 · UX overhaul | Consistent wording: sentence-case labels, places named as the sidebar names them | [017](../specs/017-unified-ux/requirements.md) | Next |
| D, E, F, H, I, J, K, M | Sky geometry, Seestar and Vespera adapters, gallery, store parity, poster, NAS deploy, describe-a-capture | later | Backlog |

## Changes to the blueprint

- **Slice C is split in three.** Discovery (what is there) needs nothing but the index, so it
  landed first. Ranking needs seasons and the moon (slice L), and recipes need the job runner
  (slice G) to be worth a Run button, so they follow those.
- **Duplicates moved from DSC-006 to ingest.** Finding duplicate bytes needs content hashes, which
  slice B adds.
- **One migration source landed early** (NFR-008, from slice I) because every new table would
  otherwise be written twice.
- **Ingest reshaped around the existing scanner** (spec 011): SHA-256 instead of BLAKE3 (native
  in Node, so faster), sampled hashing so only likely duplicates are read in full, and no
  asset/location tables until the Postgres store. Indexing TIFF/PNG/JPEG and live import progress
  (ING-002, ING-007) move to the NAS core-api.
- **Seasons use the one site in Settings** (spec 012). Several sites wait for slice D, weather
  (FWD-003) waits for an optional forecast adapter, and nautical darkness stands in on summer
  nights when astronomical darkness never comes.
- **Captures rank ahead of stacking** (spec 013). The blueprint ranked by unprocessed hours alone;
  a night cannot be moved and stacking can, so tonight's captures lead and closing seasons lead
  those.
- **Recipes start with disk space** (spec 014). Leigh's Siril_Scripts has a space estimator he
  relies on, and a stack that runs out of disk halfway wastes a night's processing, so slice C3
  opens with the stacking plan: the stock Siril script that fits and the space it needs, reimplemented
  from the estimator's arithmetic. Siril_Scripts is GPL-3.0 and post-processing (not stacking), so
  its scripts are called where they are installed, never copied (charter VI), in C3b.
- **A tool hub comes before the job runner** (spec 015). Leigh asked for a small gateway to wire
  in the tools the app needs, so every external program is found through one `ToolHub` port and
  its command is built in the domain. Recipes are shown and copied for now; slice G runs them
  through the same port. The app passes the profile, coordinates and optics it already knows, so
  Siril_Scripts needs no SIMBAD lookup and Seestar stacks plate-solve with the right pixel size.
- **The job runner is scheduled, not run-immediately** (spec 016). Siril can tie the PC up, so
  Leigh asked for "a small CI like system": jobs wait for a run window he sets (02:00 to 03:00 by
  default) and an idle PC, run one at a time at low priority, and a job predicted to overrun the
  window waits for the next night while a shorter one goes first. The queue is a SQLite table on
  the PC rather than pg-boss on the NAS until the NAS core-api exists.
- **A UX overhaul joins wave 2** (spec 017). Leigh asked for "a simple and unified experience".
  The audit found 17 flat sidebar entries, pages named differently from their sidebar entry, the
  first screen's to-do list at the bottom of the page and a target's page built as eleven stacked
  panels, so slices U1 to U5 unify the shell, Home, the target page, setup and wording before the
  remaining adapters add more pages.
- **Postgres, GraphQL and pnpm workspaces wait** until a second app (the NAS core-api) needs the
  packages. Until then the core runs inside the Electron main process over SQLite, which keeps the
  app shippable at every step.

## Open questions for Leigh

- ([#23](https://github.com/lgriffin/astrorepo/issues/23)) One night from each scope (a Seestar folder and a Vespera export, with firmware versions), so
  the scope adapters can be built from real files.
- ([#24](https://github.com/lgriffin/astrorepo/issues/24)) The Synology model, which decides the container image targets.
- ([#25](https://github.com/lgriffin/astrorepo/issues/25)) Whether the app should start itself for the run window (a Windows Task Scheduler entry), since
  jobs only start while it is open.
- ([#26](https://github.com/lgriffin/astrorepo/issues/26)) Where Siril_Scripts is cloned on the Windows PC, if not in one of the folders the tool hub
  checks (it can also be set in Settings > Tools).
