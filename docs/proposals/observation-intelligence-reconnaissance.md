# Observation intelligence: reconnaissance (slice 0)

This is slice 0 of [the proposal](observation-intelligence-and-mosaics.md): a map of what
astrorepo already has for each of the four features, what each slice reuses, and the answers this
plan takes to the proposal's open design decisions. Its exit criterion is that no slice proposes a
second subsystem for something that already exists.

## What already exists

| Need in the proposal | What astrorepo has today | Where |
|---|---|---|
| Sky geometry: positions, angular distance, tangent-plane projection | `offsetPosition`, `projectPosition`, `angularDistanceDeg`, `normaliseAngle`, RA/Dec formatting | `packages/domain/src/sky-geometry.ts` (spec 024) |
| A WCS read from headers | `fieldFromWcs` (CD matrix or CDELT/CROTA, TAN, mirrored images) | same |
| Plate solving | ASTAP then Siril through the tool hub, one background job per target, a copy in the work folder | `makeQueueSolves`, `makeRunSolveJob`, `node-plate-solvers.ts` (spec 024) |
| Where each file points | `plate_solves` keyed by path (centre, rotation, scale, size, mirrored, solver, error) | `SolveStore`, `SqliteSolveStore` |
| Lights and masters with their exposure and folder | `SkyFile` (one light per night and folder stands for its group) | `SolveStore.files` |
| A mosaic grid from a target's size | `planMosaic` (rows and columns from the catalogue size, 15% overlap minimum, rotation) | spec 024, Sky planner's **Plan a mosaic** card |
| One saved plan per target, CSV export, tiles with no lights in Next actions | `mosaic_plans`, `makeSaveMosaicPlan`, `makeExportMosaicCsv`, `makeListMosaicGaps` | spec 024 |
| Panels grouped from solves | `groupPanels`, `footprintsOverlap` (rectangles on a tangent plane) | spec 024 |
| Frame quality | FWHM, eccentricity, stars, background, noise, SNR per light; keep or reject, by frame or night | `makeFrameGrading`, `FrameSelection.rejected` (spec 019) |
| Per-filter goals | `integration_goals` (target, filter, seconds) | migrations |
| Duplicate files | `file_hashes` (sampled then full SHA-256) | spec 011 |
| Thumbnails | `fits_thumbnails` (base64 per file) and the gallery inspector's previews | spec 025 |
| Jobs, provenance and post-processing | the job runner, step-resumable Siril runs, a manifest beside every master, Siril_Scripts and RC Astro recipes | specs 016, 021, 015 |
| Collections | `collections`, `collection_memberships`, catalogue collections, the Messier mosaic | spec 032 and earlier |
| Next actions | one ranked list with kinds per source | `makeListNextActions` (spec 013) |

## What each slice reuses, and what it adds

| Slice | Reuses | Adds |
|---|---|---|
| 1 · Mosaic geometry | `offsetPosition` and the grid layout inside `planMosaic` (lifted out so both use it), the Equipment page's field of view, `mosaicNights` for each panel's nights | A **mosaic workspace**: a named, versioned grid with explicit rows, columns, overlap in each direction and a centre typed, taken from a target or from a solved file. Panels named R1C1…, each with an ICRS centre, its own position angle and a footprint polygon. Revisions are kept; CSV and JSON export. The Sky planner's existing plan can be opened as a workspace |
| 2 · FITS assignment | `SolveStore` files and solves (no second solver), the solve job for unsolved files, `fits_thumbnails` for previews | Spherical polygon footprints and their intersections with each panel (many to many), a primary panel, trays for unsolved, outside and conflicting files, manual assign and exclude kept apart from what is computed, a review of changes when a revision moves panels |
| 3 · Coverage | grading's rejects, `integration_goals` per filter, `file_hashes` for duplicates | Panel coverage from the union of accepted footprints, exposure per panel and filter counted once per frame, a heat map, gaps and a next-session list |
| 4 · Astronomy projects | collections and catalogue identities (linked, not merged), Next actions, the workspace | Projects of five kinds with completion rules and progress reconciled from the index |
| 5 · Adaptive integration | grading measurements, coverage, goals | Marginal-gain forecasts with their assumptions |
| 6 · Experiment lab | the job runner, post-processing recipes, provenance manifests, the gallery's compare view | Experiments over a fixed input manifest with two or more variants |

The existing Sky planner card stays as the quick answer for "how many panels does this target
need"; the workspace is where a plan is kept, revised and filled with real captures. The Messier
mosaic (spec 032) is a gallery of finished images and is not touched.

## Answers to the open design decisions

1. **Promote or wrap?** The spec 024 plan stays as it is (one per target, used by Next actions).
   The workspace is a new entity with its own tables, and **Open as a workspace** copies a target's
   plan into one. `SolvedField` and `plate_solves` are reused as they are.
2. **Canonical WCS parser and transform.** `fieldFromWcs` stays the one parser (TAN, no SIP
   distortion). Footprints are the solved rectangle on the file's own tangent plane; intersections
   are clipped on a gnomonic plane, where great circles are straight, and measured on the sphere.
   Reference results are checked against independently computed values in tests.
3. **Auto-accept or review?** A computed overlap is accepted automatically when most of the file
   falls in one panel, and marked for review when it does not; every manual change is undoable.
4. **Optional default thresholds.** None per filter. Goals come from the target's own
   `integration_goals`; coverage uses one editable threshold (95% of a panel for "covered").
5. **What a goal means.** A conjunction, with each part reported on its own: coverage, usable
   integration per filter, processed and published.
6. **Several rigs on one grid.** One sky plan with the field it was drawn for; a capture
   configuration per rig can come later.
7. **Rendering.** An SVG in the renderer on the mosaic's own tangent plane, drawn from coordinates
   the core works out. No WCS library is added until a fixture shows SVG is not enough.
8. **Archived or offline files.** A file the index no longer lists keeps its last solve and any
   manual assignment, and is shown as missing rather than present.

## Numbering

Slices 1 to 3 become spec 037 (`specs/037-mosaic-workspace`) with the proposal's
`MO-` IDs; projects, forecasts and experiments get specs 038 to 040 with `AP-`, `AI-` and `PE-` IDs.
