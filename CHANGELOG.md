# Changelog

All notable changes to astrorepo. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and versions follow [Semantic Versioning](https://semver.org/). Until 1.0.0, a minor version marks a
set of slices that works end to end and a patch version marks fixes. The app reaches 1.0.0 once it has
run on real data on the Windows PC ([#31](https://github.com/lgriffin/astrorepo/issues/31)) and the
licence is settled ([#32](https://github.com/lgriffin/astrorepo/issues/32)).

Each entry links its spec, where the EARS requirements live, and its pull request.
[docs/roadmap.md](docs/roadmap.md) has the plan and what comes next.

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
