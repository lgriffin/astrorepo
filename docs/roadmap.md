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
| O · Other rigs | DSLR camera RAW indexed from its metadata; mono cameras with filter wheels stacked per filter, with the filter to shoot tonight; comets placed in every light and stacked on their motion. Each part shows only when such frames or settings exist | [026](../specs/026-other-rigs/requirements.md) | Done |
| S · A stable base | The hexagon checked across every layer with a ratchet on legacy code; rules out of presenters and IPC; a contract suite on both sides of every port; EARS citations only in test titles, with 63 Gherkin scenarios; property, fuzz and mutation testing of the core. See [docs/testing](testing/) | [027](../specs/027-hexagon-hardening/requirements.md), [028](../specs/028-ears-bdd/requirements.md), [029](../specs/029-property-fuzz/requirements.md), [030](../specs/030-mutation-testing/requirements.md) | Done (PRs #52 to #57) |
| F1 · Vespera control | A Vespera page under Files: the scope's observations over its Wi-Fi (FTP at 10.0.0.1), what is new against the PC, and a copy into each target's raw folder that never touches the scope or overwrites a file, carries on after a Wi-Fi drop, and ends in a home scan | [033](../specs/033-vespera-ftp/requirements.md) | Done |
| F2 · Vespera ingest | Leigh's Vespera Pro FTP ingest design: every session on the scope parsed from listings alone (sessions by time and kind, runs by suffix), counted by kind with findings (missing frames, partial listings, no TIFF), its target named from the folder, observation.json, the stack's EXIF or a FITS header, and the ticked sessions copied one after another into their targets' folders, each in a folder named for what it holds (`M31/M31_2026-10-14_FIT=400_TIF=1`), resuming after a Wi-Fi drop and ending in a SHA-256 manifest. Replaces F1's list and copy: one flow on the Vespera page | [034](../specs/034-vespera-ingest/requirements.md) | Done |
| H2 · Gallery | Every PNG and JPEG in the images folder as a gallery; each picture's name (M31.png, NGC7000_HOO.png, Andromeda Galaxy.jpg, or the folder it is in) matched to the catalogue, with a side panel on what the object is, when it is best placed, what you have of it, and links to its target page, mosaic plan, collections, SIMBAD and Wikipedia | [031](../specs/031-gallery/requirements.md) | Done |
| J · Messier mosaic | All 110 Messier objects on one page with your own picture in each tile, how far each has come, when each gap is up from your site (tonight, held back by the moon, a later month, or never), the gaps up tonight in Next actions, and the whole mosaic saved as one PNG | [032](../specs/032-messier-mosaic/requirements.md) | Done |
| R1 · Pi variant: transport seam | Every IPC handler on a channel router with no Electron in it, and a Desktop port for pickers, saving exports, opening folders and links, so a headless server can host the same channels for a Raspberry Pi kiosk. Nothing changes on Windows | [035](../specs/035-pi-variant/requirements.md) | Done |
| R2 · Pi variant: headless host | `npm run serve` runs astrorepo without Electron: the same pages and handlers in any browser over HTTP, locked to this machine's names with a per-start token. The web UI step after the Windows app | [035](../specs/035-pi-variant/requirements.md) | Done |
| R3 to R5 · Pi variant | The Pi install and kiosk, touch-first tonight view with red night mode and an idle slideshow, field ingest to the NAS | [035](../specs/035-pi-variant/requirements.md) | Next: R3 |
| W · Clear skies | Home opens on tonight and the next two nights, each "Clear skies", "Clear spells" (with times) or "Cloudy" over its dark window, from Open-Meteo or MET Norway (chosen in Settings → Weather) and Leigh's own weatherlink_website service (tonight's rain and frost chances, the low, the warnings in force), with dew warnings and the moon | [036](../specs/036-clear-skies/requirements.md) | Done |
| E, F, I, K, M | Seestar and Vespera adapters, store parity, NAS deploy, describe-a-capture. Order after the slices above: I, then E, F, K and M as their blockers clear ([#33](https://github.com/lgriffin/astrorepo/issues/33)) | later | Backlog |

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
- **Other rigs stay out of Leigh's way** (spec 026). DSLR RAW, filter wheels and comets are for
  other people's rigs, so each part shows only when such frames or settings exist. RAW tags are
  read by a small TIFF reader of the app's own rather than a new library. CR3 and RAF are found but
  not read, and RAW pixels are left to Siril (so RAW lights are not graded). A filter is suggested
  only when the app can name two of a target's filters, which the Seestar's LP and IR-cut filters
  never are. Comets are placed by a two-body orbit from the MPC's line, within an arc minute of a
  published ephemeris; the app writes the positions file and Siril does the comet registration.
- **The gallery splits in two.** The inspector, palettes, compare and overlays (H1) need only the
  index and plate solves. The gallery itself (H2, spec 031) reads the images folder of the home
  folder, where the home scan already looks for finished pictures, and names each picture's object
  from its file or folder name rather than its pixels; browsing finished images elsewhere on the
  NAS still waits for where files live ([#38](https://github.com/lgriffin/astrorepo/issues/38)).
  Its name matching (`readImageName` and the `ObjectCatalogue` port) is the lookup the poster (J)
  should use for a picture's object.
- **The inspector reads the header's solution, then the stored plate solve** (specs 025, 024).
  The overlay needs a solved field: H1 draws the grid from a FITS header's own WCS, and for a
  file without one from the solve slice D stored for its path, which has the same field shape and
  records whether the image is mirrored when the solver says. Finished images are FITS and PNG for now,
  since JPEG and TIFF need a decoder, and the chosen palette is a hint beside the Siril_Scripts
  command because v2 has no palette option.
- **Slice F splits in two** (spec 033). Leigh asked for a native FTP connection to the Vespera
  with a control page of its own, so F1 copies observations off the scope over its Wi-Fi into the
  home folder's raw folder, where the home scan already finds targets. Reading the scope's JSON
  metadata and XISF wait for a sample night (#23). The FTP layout comes from Vaonis's support
  pages and owners' write-ups, and has not yet been checked against a real Vespera.
- **A Raspberry Pi variant** (spec 035). Leigh asked (15 October 2026) for a variant of the app
  on a Pi, with RaspAstroDisplay as inspiration, and chose a headless server with a kiosk over
  an Electron build for arm64. It is also the web UI step after the Windows app. R1 moves the
  handlers onto a router any host can serve; R2 serves it over HTTP (`npm run serve`).
- **One Vespera copy flow** (spec 034). Leigh's ingest design adds what F1 did not: a review of
  each session's counts and findings before anything is copied, a target astrorepo names (with
  why) and the user can override, folder names that carry the counts, resume from a `.part` with
  REST, and a manifest with each file's SHA-256. Leigh then asked for one flow, so F2 replaced
  F1's list, copy and progress; F1 keeps the FTP connection and the Connection card. What F1 did
  that the design did not say is kept: ticked sessions copy in one go, the disk is checked for
  room first, copies land in the target's folder for the home scan, and the home scan runs after.
  FITS and TIFF are copied by default, JSON only when ticked (Leigh). The keys inside
  observation.json and the TIFF file name are not yet seen on a real scope (#23).
- **Weather is FWD-003, as its own card** (spec 036). Leigh asked for the next three nights at a
  glance with "clear skies" when that is the forecast, a choice of weather service, and his own
  weatherlink_website integrated. One `WeatherSource` port has Open-Meteo, MET Norway and the
  user's service behind it; ideas taken from kshetline/aw-clock are the chosen service with others
  alongside and the on-screen credit, not its scraped or keyed providers. weatherlink_website has
  no cloud cover yet, so the public forecast judges the sky and Leigh's station adds what it knows
  about tonight (and holds back a clear night it expects rain on). The verdict is shown above Next
  actions rather than used to rank them until it has been checked against real nights.
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
  the scope adapters can be built from real files. For the Vespera page (spec 033): one Look for
  observations on the scope's Wi-Fi, to confirm the folder names, MLSD or LIST, and the darks folder.
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
- **The Messier poster becomes a live mosaic** (spec 032). Leigh asked for a mosaic of the Messier
  objects with his own image files embedded, opened with a button and tied into planning so the
  gaps show with when they can be shot. Slice J is that page first and a PNG second; Posters keeps
  printing other collections. Tiles are found from the seeded catalogue and pictured from each
  target's finished images, then its masters; JPEG and TIFF are drawn by the desktop host's native
  images because the app has no decoder for them. The outlook reuses the forward plan's sky and
  rules, and the three best gaps for tonight join Next actions.
