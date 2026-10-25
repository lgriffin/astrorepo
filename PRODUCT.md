# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

The app is an Electron desktop app on Windows; the same React pages are also served to a browser by `npm run serve` (a Raspberry Pi kiosk and companion screens, spec 035). Design language is the web's, not a native OS one.

## Users

- Primary: Leigh, an amateur astrophotographer with a Seestar S50 and a Vaonis Vespera Pro, who stacks with Siril and finishes with RC Astro tools. He uses astrorepo at his Windows PC (confirmed 25 October 2026), sorting nights of data, planning the coming nights and queuing stacks; not at the scope.
- Secondary: other amateur astrophotographers, since the project is open source. They may shoot DSLR or mirrorless RAW, mono cameras with filter wheels, or comets.

## Product Purpose

A local-first observatory cockpit that sits on top of the data an astrophotographer already has. It reads FITS and RAW files where they are (never renaming them), shows what is hiding in them, tells each target what it is ready to become, says whether the next nights look clear and what to shoot, and drives the tools already installed (Siril, Siril_Scripts, RC Astro, SyQon, ASTAP) as a small job queue on the PC. Success is the user always knowing the next useful thing to do with their sky and their disk.

## Positioning

It works from the user's own files and own sky: integration counted from the FITS headers, seasons and moon windows from their site, stacks planned against their actual free disk space, and their own scopes' quirks (Seestar and Vespera folder layouts, the Vespera's Wi-Fi FTP). A generic catalogue or planning app cannot know any of that.

## Operating Context

- One loop: find what you have, plan what to shoot, check what you shot, stack, process, archive.
- Data spreads over raw, stacked, TIFF and finished files on the PC and a Synology NAS; disk space matters a great deal to Leigh.
- Heavy jobs (Siril stacking) run in a nightly run window when the PC is idle.
- Requirements are EARS statements in `specs/<nnn>/requirements.md`; the architecture is hexagonal (see `CLAUDE.md`).

## Capabilities and Constraints

- Home (Next actions, clear skies, coming nights, hidden data), Targets with a page per target, Sky planner and mosaic planning, Jobs, Library and FITS headers, Gallery, Calibration, Vespera copy, Nights, Stacks, Insights, Storage, Collections, Messier mosaic, Posters, Equipment, Settings.
- A mosaic workspace and observation intelligence (projects, forecasts, processing experiments) are being added (specs 037 to 040).
- Catalogues ship about 800 objects (Messier, NGC, IC, Caldwell, Sharpless); most are never observed by a given user.
- Wording is sentence case, checked by `tests/unit/wording.test.ts`.

## Brand Commitments

None fixed. Leigh, 25 October 2026: "Nothing is fixed, be big." The name AstroRepo stays.

## Evidence on Hand

- Screenshots of every page (October 2026) in the project files under `ux-overhaul/audit-2026-10/`.
- No real user data is committed; screenshots use an empty data folder or sample data, labelled as such. Never invent observing totals or images.

## Product Principles

- The user's own sky and files come first; the catalogue is something to browse into.
- Always show the next useful action, with the reason.
- Never touch source files; say what would change before anything is deleted or moved.
- Ask for a setting once, in one place.
- Open source: readable by any astrophotographer, not only the author.

## Accessibility & Inclusion

WCAG 2.1 AA contrast in every theme (checked by `tests/unit/look-and-feel.test.ts`), full keyboard use, and a red night theme for anyone who does use it near the scope.
