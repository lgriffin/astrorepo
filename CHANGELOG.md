# Changelog

All notable changes to astrorepo. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and versions follow [Semantic Versioning](https://semver.org/). Until 1.0.0, a minor version marks a
set of slices that works end to end and a patch version marks fixes. The app reaches 1.0.0 once it has
run on real data on the Windows PC ([#31](https://github.com/lgriffin/astrorepo/issues/31)) and the
licence is settled ([#32](https://github.com/lgriffin/astrorepo/issues/32)).

Each entry links its spec, where the EARS requirements live, and its pull request.
[docs/roadmap.md](docs/roadmap.md) has the plan and what comes next.

## [Unreleased]

### Added
- **Vespera ingest** (spec 034): the Vespera page has one copy flow. **Scan the scope** lists
  every session from its listings alone, counts FITS, TIFF, JPEG and JSON per run, flags what
  looks wrong (missing frames, more JPEGs than FITS, no TIFF, unknown files), and names each
  session's target from its folder, observation.json, the stack's EXIF or a FITS header (or your
  own name). **Copy selected** copies the ticked sessions one after another, each into its
  target's folder under a folder named for what it holds, such as
  `M31/M31_2026-10-14_FIT=400_TIF=1`, after checking the disk has room, then runs the home scan.
  FITS and TIFF are copied by default. A dropped Wi-Fi link pauses the copy; resume carries on
  from the partial file. Every copy ends in `astrorepo.manifest.json` with each file's SHA-256.
  The scope is only ever read. This replaces spec 033's list and copy.
- **Vespera control** (spec 033): a Vespera page under Files lists the scope's observations over
  its Wi-Fi (anonymous FTP at 10.0.0.1, configurable) with what is already on the PC, and copies
  the ones you tick into each target's raw folder, then runs the home scan. Copies never change
  anything on the scope, never overwrite a file, and carry on from where a Wi-Fi drop stopped
  them. The FTP client is written on Node's sockets, with every reply and listing parsed in the
  domain and fuzzed.
- **Frame grading** (spec 019): every light measured for FWHM, eccentricity, stars, background,
  noise and SNR, graded against limits in Settings and its own night, kept or rejected by hand,
  exported as CSV; only kept lights go to Siril.
- **Stacking advice** (spec 020): memory per Siril script against the PC's, image scale and
  whether Bayer drizzle is worth it, the rejection that suits the kept lights, why calibration
  frames do or do not match, each night with its flats and a way to leave it out, and planning
  that suggests the filter a target is short of.
- **Provenance** (spec 021): stacks run Siril's stock script a step at a time and carry on from
  the step they stopped at after the app closes; a result is published only when every step
  succeeded, with a manifest beside it naming the script, steps and every frame; a failed run's
  partial result is set aside; known Siril failures are explained; each target's runs read as a
  timeline.
- **Archive** (spec 022): step 5 on a target's Stack and process archives a finished target,
  linked to its raw frames on the NAS or self-contained with them bundled in. It first shows
  every work folder's size, the space removing it frees (hard links count as nothing) and whether
  a stack manifest can rebuild it, then removes only what you tick. Archives are built in a
  staging folder and renamed into place, so a failed copy leaves nothing behind. Settings →
  Folders → Archive folder sets where they go.
- **SyQon CLI and tool health** (spec 023): the SyQon CLI joins Settings, under Tools, found from
  your path, `SYQON_CLI_PATH`, its install folder or the Windows App Paths key, with the models
  your account may use. Star separation, sharpening, denoise and gradient removal can be queued
  for a target's stack, with live progress, and an output is replaced only when you say so. Every
  tool shows its version and whether the catalogues it needs are installed (ASTAP's star
  database, Siril's Gaia SPCC catalogue, RC Astro's models); a missing one joins Get set up and
  blocks the step that needs it, except Siril's Gaia catalogue, which is optional because Siril
  fetches Gaia data online without it, and RC Astro's models, shown but optional until their file
  names are confirmed. One exit-code contract explains how Siril, Siril_Scripts, RC
  Astro and SyQon runs ended. The app calls the SyQon CLI you installed and never bundles it.
- **Sky geometry** (spec 024): plate solving with ASTAP, or Siril's own solver when ASTAP is not
  installed, of one light per folder per night and every master, as one background job per
  target over hard links or copies in the work area; files whose headers already carry a WCS are
  placed without solving; each target's Overview shows where its files point, warns when they
  may be filed under the wrong name and shows the rotation by night; a mosaic planner on the Sky
  planner proposes tiles with at least 15% overlap, their centres, the hours each needs and the
  nights every panel is up, with CSV export; solved lights are grouped into a mosaic's panels and
  Next actions names tiles with no lights. A WCS's centre comes from its reference pixel; a solve
  that finds no match near the filed target is retried over the whole sky, and a failed one is
  retried next time; fields overlap by their turned rectangles, corners included; a turned grid
  covers the target along its own axes; saving a plan, not viewing, links other targets' panels,
  once per pair; cancelling a solve job starts no further file.
- **Gallery inspector** (spec 025): opening a file on the FITS files page shows its histogram per
  channel, median, noise, saturated and black-clipped share, the brightest unsaturated star's
  FWHM and profile, and a preview with a coordinate grid and Messier, NGC and IC labels when its
  header is solved or the file was plate solved; a target's Files compares two of its masters or finished images side by side
  or with a slider, and lists the palettes its filters allow with a preview and a choice shown
  beside post-processing. The histograms share one range; a star clipped in one colour or one
  Bayer pixel counts as saturated; a header's full CD matrix places the grid; stored solves keep
  whether the image is mirrored; the slider shows each image's own grid; a file is read once for
  its figures and preview, one at a time on the worker; PNGs are size-checked from the header and
  inflated no further than their stated size; a broadband LP filter gives red, green and blue, while a Seestar's LP filter stays dual-band.
- **Other rigs** (spec 026): DSLR and mirrorless camera RAW (CR2, NEF, ARW, DNG and other
  TIFF-based RAW) indexed from its tags, with ISO as gain, and stacked with Siril's colour script;
  CR3 and RAF listed as found but not read. Mono lights with several filters stacked one filter at
  a time in their own work folders, with flats checked per filter and each channel master listed.
  Tonight's plan names the filter to shoot on a filter-wheel target, for the moon and the lagging
  channel. Comets take their orbit from the Minor Planet Center's line; the app works out where the
  comet is in every light and writes the positions file for Siril's comet registration. None of
  it shows for a Seestar or Vespera target.

### Fixed
- A "Flat Light" or "Dark Light" frame no longer counts toward a target's integration (#53).
- Bugs the fuzz and property tests found (#56): a FITS header could hang the scanner or make the
  image reader allocate 400 MB; all-NaN images gave nonsense statistics; the two FITS header
  readers disagreed; a camera RAW file could crash the tag reader; impossible ASTAP and Siril
  solves were accepted; a model or object called `constructor` misbehaved; a Siril script could
  step outside the work folder; histograms could drop values; and the comet CSV did not quote
  carriage returns.
- Several testkit fakes behaved unlike the real adapters (job logs, the process runner, the run
  area and image pixels), so some use-case tests passed on behaviour the app does not have (#54).
- **Other rigs review fixes** (spec 026): RAW darks and flats in folders such as `Darks_ISO800`,
  `Flats-L` or `Darks/ISO800` are no longer stacked as lights; impossible EXIF dates and time
  offsets, and comet perihelion days the month does not have, are refused; RAW frames are no
  longer plate solved; queueing one filter's stack hides only that filter's Queue button; filters
  whose names make one folder name (`S II`, `S.II`) get folders of their own.
- **Scanning a large library no longer locks up the PC** (spec 018): the scan used to run as one
  uninterrupted block on the app's main process. It now walks, reads and writes a small piece at
  a time and rests in between, shows live file counts, can be cancelled, and carries on from where
  a cancelled scan stopped.

### Changed
- **Hexagon hardening** (spec 027): the architecture check reads the source with the TypeScript
  compiler and covers every layer: the core may not use the clock, randomness or host globals;
  the renderer reaches the main process only through the bridge; adapters never import legacy
  services, IPC, composition or each other; use cases are built only in composition. A ratchet
  stops legacy code (`getSqlite()` calls, services, legacy IPC calls) from growing. Adapters take
  the Clock port instead of calling `new Date()`, and share SQL and settings helpers from
  `src/main/adapters/shared/`.
- **Rules in one place** (spec 027, #53): presenters hold wording only. Whether a stack can be
  queued, its space verdict, the clipping threshold and which job a suggestion reflects are domain
  rules the page and the queue share, and the app's folders come from one `AppFolders` adapter.
- **Contract suites on both sides of every port** (#54): every port has a suite that runs on its
  testkit fake and on a real adapter, and the build fails when one does not.
- **Stricter EARS gate and BDD** (spec 028, #55): requirement IDs count only in test titles and
  Gherkin tags; an "If ..., then ..." requirement needs a test that names the failure. 63 Gherkin
  scenarios in `features/` walk Leigh's main journeys against the use cases.
- **Property and fuzz tests** (spec 029, #56): 67 properties over the domain rules and a fuzz suite
  over every parser of untrusted input, nightly at 20,000 runs per parser.
- **Mutation testing** (spec 030): Stryker mutates the hexagonal core; pull requests mutate the
  core files they change and fail below the 80% floor, and the whole core runs nightly. The first
  full run scored 76.8%; about 250 sharper tests then brought every core file to at least 80% and
  the whole core to 89.2%.

## [0.2.0] - 2026-09-30

The first release since the cockpit blueprint. Discovery, planning, stacking and job running now
work together under one unified interface.

### Added
- **Hexagonal core** (spec 009, #14): `packages/domain`, `packages/application` and the testkit,
  contract suites for every port, and an EARS gate (`npm run ears`) that fails when a requirement
  has no test naming it.
- **Discovery cockpit** (spec 010, #15): what is hiding in the FITS files, progress worked out
  from the data, "What the files say" on each target, and suggestions you can dismiss.
- **Ingest core** (spec 011, #16): Siril prep in a separate work area so sources are never
  renamed, fast rescans, quarantine for unreadable files, and a sampled SHA-256 duplicate check.
- **Seasons, moon and tonight** (spec 012, #17): the Coming nights card, a 12-month season table,
  closing-season warnings, new-moon windows and bright-moon filtering from your site.
- **Ranked next actions** (spec 013, #18): tonight's captures, closing seasons first, ranked ahead
  of stacking suggestions.
- **Stacking plan** (spec 014, #19): which stock Siril script fits a target's frames, the disk it
  needs stage by stage, and whether the work area has room.
- **Tool hub and post-processing recipes** (spec 015, #20): Settings → Tools finds Siril,
  Siril_Scripts v2, the RC Astro CLI and Git Bash. Each target gets the Siril_Scripts v2 command
  for its stack.
- **Job runner** (spec 016, #21): a small CI-like queue. Stack and post-processing runs start in
  a nightly run window (02:00 to 03:00 by default) while the PC is idle, one at a time at low
  priority, with a predicted length, live logs, Run now and Cancel.
- **Get set up** (spec 017, #29): a checklist on Home (site, home folder, library scan, Siril)
  until every step is done.

### Changed
- **One map of places** (spec 017, #22): a grouped sidebar with the four daily places first. Each
  place has one name, detail pages get back links, a jobs status line shows on every page, and
  links open the Settings section they name.
- **Home first** (spec 017, #27): Home opens on Next actions, then Coming nights and hidden data,
  then progress. The totals moved to Insights, and a stack already queued says so on Home.
- **A target in one flow** (spec 017, #28): a target's page has four tabs. Stack and process walks
  through stack, then post-process, then the target's runs.
- **Setup once** (spec 017, #29): the site is set only in Settings → Your site. Empty pages say
  what would appear and link to the step that fills them.
- **Consistent words** (spec 017, #30): sentence-case labels throughout, checked by a test.
- The charter (`.specify/memory/constitution.md`) is at 1.1.1.

### Fixed
- Review findings on every slice. Among them: Home cards that spun forever when a request failed,
  a failed queue check that offered Queue again, Back skipping target tabs, and a setup checklist
  that ticked off a scan of another folder.

## [0.1.0] - 2026-08-22

The Electron app before the blueprint (PRs #1 to #13): the target catalogue with Messier, NGC and IC,
the home-folder scan, the FITS metadata analyzer, sessions and the timeline, collections and the
poster, equipment profiles, the Sky planner, stacking analysis, storage analytics, insights and
import/export.

[0.2.0]: https://github.com/lgriffin/astrorepo/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/lgriffin/astrorepo/releases/tag/v0.1.0
