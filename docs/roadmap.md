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
| C3b · Tool hub and post-processing recipes | Settings → Tools finds Siril, Siril_Scripts, RC Astro and Git Bash; each target's page gives the Siril_Scripts v2 command for its stack (profile, coordinates and optics filled in) and the disk it needs | [015](../specs/015-tool-hub/requirements.md) | Done |
| G · Job runner | A small CI-like queue on the Windows PC: stack and post-processing runs start in a nightly run window while the PC is idle, one at a time at low priority, with predicted length, live logs, Run now and Cancel | [016](../specs/016-job-runner/requirements.md) | Done |
| U1 · One map (UX overhaul) | Sidebar grouped into the four daily places plus Files, Review, Collections and Setup; one name per place; back links on detail pages; jobs status on every page; links open the Settings section they name | [017](../specs/017-unified-ux/requirements.md) | Done (PR #22) |
| U2 · Home first (UX overhaul) | Home opens on Next actions, then Coming nights and hidden data, then progress; totals move to Insights; a stacking suggestion already queued in Jobs says so; one shared card and empty state | [017](../specs/017-unified-ux/requirements.md) | Done (PR #27) |
| U3 · A target in one flow (UX overhaul) | A target's page in four parts (Overview, Stack and process, Files, Notes and nights); stack, post-process and runs as numbered steps that say when a job is already queued; suggestions and jobs open the target at Stack and process | [017](../specs/017-unified-ux/requirements.md) | Done (PR #28) |
| U4 · Setup once (UX overhaul) | The site set only in Settings; a Get set up checklist on Home until the site, home folder, a scan and Siril are there; empty pages link to the step that fills them | [017](../specs/017-unified-ux/requirements.md) | Done (PR #29) |
| U5 · Consistent words (UX overhaul) | Every button, figure label, card title and suggestion action in sentence case; messages name places as the sidebar does; a test fails on new title-case labels | [017](../specs/017-unified-ux/requirements.md) | Done (PR #30) |
| Q1 · Frame grading | Every light measured for FWHM, eccentricity, noise, background, star count and SNR weight; graded against limits in Settings; trend per night; manual keep or reject; CSV export; only kept lights go to Siril | [019](../specs/019-frame-grading/requirements.md) | Done |
| Q2 · Stacking advice | Memory beside the disk estimate; drizzle and rejection advice from image scale and frame count; calibration gaps explained; one stacking plan across nights; channel balance suggestions | [020](../specs/020-stacking-advice/requirements.md) | Done |
| P1 · Provenance | A manifest beside every master; outputs staged and published only on success; long stacks resume by stage; a processing timeline per target; known Siril failures explained | [021](../specs/021-provenance/requirements.md) | Done |
| P2 · Archive | Archive a finished target, linked or self-contained, with the space each intermediate frees shown first | [022](../specs/022-archive/requirements.md) | Done |
| N · Hub: SyQon CLI and tool health | SyQon CLI found and run like RC Astro; tool versions and the catalogues each needs; one exit-code contract for every tool | [023](../specs/023-hub-syqon/requirements.md) | Done |
| D · Sky geometry | Plate solving with ASTAP, Siril as fallback, one light per folder per night and every master as a background job; "may be filed under the wrong name" and rotation by night on each target; a mosaic planner on the Sky planner with tiles, hours, clear nights and CSV; panels grouped from their solves and empty tiles in Next actions | [024](../specs/024-sky-geometry/requirements.md) | Done |
| H1 · Gallery inspector | Histogram, noise, clipping and the brightest star per file; palette suggestions with a preview, the choice shown beside post-processing; compare two images side by side or with a slider; a coordinate grid and catalogue labels on images whose header is solved or that were plate solved | [025](../specs/025-gallery-inspector/requirements.md) | Done |
| O · Other rigs | DSLR camera RAW indexed from its metadata; mono cameras with filter wheels planned per filter; comets stacked on their motion | [026](../specs/026-other-rigs/requirements.md) | Planned |
| E, F, H2, I, J, K, M | Seestar and Vespera adapters, the rest of the gallery, store parity, poster, NAS deploy, describe-a-capture. Order after the slices above: H2, I, J, then E, F, K and M as their blockers clear ([#33](https://github.com/lgriffin/astrorepo/issues/33)) | later | Backlog |

## Releases

| Version | Date | What it holds |
|---|---|---|
| [0.2.0](../CHANGELOG.md#020---2026-09-30) | 2026-09-30 | Slices A, B, C1 to C3b, L, G and the UX overhaul U1 to U5 |
| [0.1.0](../CHANGELOG.md#010---2026-08-22) | 2026-08-22 | The app before the blueprint |

Until 1.0.0, a minor version marks a set of slices that works end to end. 1.0.0 comes once the
app has run on real data on the Windows PC and the licence is settled.

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
  asset/location tables until the Postgres store. Indexing TIFF/PNG/JPEG (ING-002) moves to the NAS core-api.
  Live scan progress (ING-007) landed with the gentle scan (spec 018) instead.
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
- **SyQon Studio's habits join the plan (October 2026).** Leigh asked which of SyQon Studio's
  58 functions astrorepo should replicate ([comparison](https://claude.ai/artifact/Wkr1DN98RMjfouXZ772rZY)).
  Its editing tools stay in Siril, RC Astro and SyQon; what moves in is the discipline around the
  pixels: grade every subframe before stacking (Q1), advise on the stack (Q2), record what made
  every master and never publish a partial one (P1), archive finished targets (P2), and plate solve
  and plan mosaics (D, reshaped around ASTAP). Leigh answered: SyQon's CLI joins the tool hub like
  RC Astro (N), Q comes first, plate solving supports both ASTAP and Siril, and other people's rigs
  (DSLRs, mono cameras with filters, comets) come after his own needs (O).
- **Archives run while you wait, not in the job runner** (spec 022). The job runner starts
  programs in a night window; an archive runs none and needs Leigh there to confirm what it
  removes, so it copies when he presses Archive, into a staging folder that is renamed into place
  only when every copy checks out. Only intermediates a stack manifest can rebuild are offered for
  removal, and hard-linked frames are shown as freeing nothing.
- **Checking a tool runs it, a little** (spec 023). A tool's version and SyQon's models can only
  come from the tools themselves, so Settings runs each tool's version flag and
  `syqon-cli --list-models`, and nothing else; finding tools and building recipes still run
  nothing. A catalogue a found tool cannot run without (ASTAP's stars) blocks the step that needs
  it, rather than letting it fail at night. Siril's Gaia SPCC files are shown but optional, since
  Siril's colour calibration fetches Gaia data online without them, and so are RC Astro's models
  until the installer's file names are confirmed. ASTAP is checked
  for health only; plate solving stays in slice D, which reuses `astapCatalogues`. Several SyQon
  details the developer pages do not name (exit codes 1 to 3 and 5 to 7, the run flags) are
  assumptions listed in spec 023 to confirm.
- **Sky geometry solves copies, per folder** (spec 024). ASTAP and Siril both write beside the
  image they solve, so each file is hard linked or copied into the work area first. One light is
  solved per folder per night rather than per night, because a mosaic's panels are captured into
  folders of their own, and a target's files are solved by one background job rather than one
  job each. A solve that finds no match near the filed target's position is retried blind, so a
  misfiled target is placed and flagged rather than failing; a failed solve is retried the next
  time. Panels are linked to a mosaic only when its plan is saved, never just by viewing.
  Catalogue health for ASTAP stays with slice N.
- **The gallery splits in two.** The inspector, palettes, compare and overlays (H1) need only the
  index and plate solves; browsing finished images across the NAS (H2) waits for where files live
  ([#38](https://github.com/lgriffin/astrorepo/issues/38)).
- **The inspector reads the header's solution, then the stored plate solve** (specs 025, 024).
  The overlay needs a solved field: H1 draws the grid from a FITS header's own WCS, and for a
  file without one from the solve slice D stored for its path, which has the same field shape and
  records whether the image is mirrored when the solver says. Finished images are FITS and PNG for now,
  since JPEG and TIFF need a decoder, and the chosen palette is a hint beside the Siril_Scripts
  command because v2 has no palette option.
- **C4 diagrams** live in [architecture/c4.md](architecture/c4.md) and are updated by every slice
  that adds a port, an adapter or an external tool.
- **Postgres, GraphQL and pnpm workspaces wait** until a second app (the NAS core-api) needs the
  packages. Until then the core runs inside the Electron main process over SQLite, which keeps the
  app shippable at every step.

## Open questions for Leigh

Each is a GitHub issue labelled [needs-leigh](https://github.com/lgriffin/astrorepo/issues?q=is%3Aopen+label%3Aneeds-leigh),
with what is needed and the default used until it is answered.

- ([#31](https://github.com/lgriffin/astrorepo/issues/31)) Try v0.2.0 on the Windows PC with real data.
- ([#32](https://github.com/lgriffin/astrorepo/issues/32)) Choose the licence. README says ISC and the blueprint picked Apache-2.0.
- ([#33](https://github.com/lgriffin/astrorepo/issues/33)) Confirm the order of the next slices.
- ([#23](https://github.com/lgriffin/astrorepo/issues/23)) One night from each scope (a Seestar folder and a Vespera export, with firmware versions), so
  the scope adapters can be built from real files.
- ([#24](https://github.com/lgriffin/astrorepo/issues/24)) The Synology model, which decides the container image targets.
- ([#25](https://github.com/lgriffin/astrorepo/issues/25)) Whether the app should start itself for the run window (a Windows Task Scheduler entry), since
  jobs only start while it is open.
- ([#26](https://github.com/lgriffin/astrorepo/issues/26)) Where Siril_Scripts is cloned on the Windows PC, if not in one of the folders the tool hub
  checks (it can also be set in Settings → Tools).
- ([#34](https://github.com/lgriffin/astrorepo/issues/34)) Which RC Astro tools are installed, and whether overnight jobs may run them.
- ([#35](https://github.com/lgriffin/astrorepo/issues/35)) How the Windows app is installed and updated (from source, an unsigned installer, or signed with auto-update).
- ([#36](https://github.com/lgriffin/astrorepo/issues/36)) Whether to protect `main` with required checks.
- ([#37](https://github.com/lgriffin/astrorepo/issues/37)) The DGX Spark's Ollama address and preferred model, for slice M.
- ([#38](https://github.com/lgriffin/astrorepo/issues/38)) Where the raw, stacked, TIFF and finished files live today, for the import and gallery slices.
