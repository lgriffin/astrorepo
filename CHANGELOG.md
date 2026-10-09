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

### Fixed
- **Scanning a large library no longer locks up the PC** (spec 018): the scan used to run as one
  uninterrupted block on the app's main process. It now walks, reads and writes a small piece at
  a time and rests in between, shows live file counts, can be cancelled, and carries on from where
  a cancelled scan stopped.

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
