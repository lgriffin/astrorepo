# AstroRepo — Observation Intelligence, Processing Experiments & Mosaic Projects

**Status:** Proposed feature specification  
**Date:** 2026-10-25  
**Target:** [lgriffin/astrorepo](https://github.com/lgriffin/astrorepo)  
**Proposed repository location:** `docs/proposals/observation-intelligence-and-mosaics.md`

## 1. Purpose

Extend AstroRepo's existing local-first observatory workflow through four interoperating capabilities:

1. **Adaptive Integration Intelligence** — estimate the incremental value of additional exposure for a target, channel, or mosaic panel.
2. **Processing Experiment Lab** — run reproducible, comparable stacking and post-processing variations without replacing originals.
3. **Automated Astronomy Projects** — define and track multi-session observing campaigns with measurable completion criteria.
4. **Coordinate-based Mosaic Workspace** — define a geometrically accurate mosaic grid, associate acquired FITS frames and masters with planned panels, inspect actual coverage, and track the mosaic through completion.

These capabilities should share identities, frame-level measurements, WCS solutions, job/provenance records, and collection/project progress. They are **extensions**, not replacements, for AstroRepo's existing sky mosaic tile planner, plate-solve grouping, Messier collection mosaic, image inspector, frame grading, and Siril job runner.

### Existing baseline to reuse

The public repository describes:

- a sky planner proposing overlapping mosaic tiles and exporting CSV;
- solved FITS frames, including grouping lights by mosaic panel;
- FWHM, eccentricity, star count, sky background, noise, and SNR grading;
- stacking plans, Siril/Siril_Scripts recipes, job queue and provenance manifests;
- project-like collections and a Messier mosaic of finished images;
- Electron/React, TypeScript hexagonal core, SQLite, ASTAP/Siril integrations, Zod IPC boundaries, and EARS/BDD/property/mutation tests.

Before implementing, inspect and reuse the specific existing types, tables, IPC channels, and use cases. Do not create duplicate mosaic, target, asset, or job subsystems.

## 2. Guiding principles

- **Local first, source-safe:** FITS/RAW files remain in their original location; never mutate source data or silently reorganise folders. Store links/IDs, metadata, derived previews and provenance separately.
- **Coordinate truth:** mosaic grids and file placement come from celestial coordinates, WCS transforms and measured image footprints, not filenames or assumed panel labels.
- **Explainable analytics:** recommendations include inputs, assumptions, confidence and measurement provenance; do not present estimated image quality as certainty.
- **Repeatable processing:** preserve inputs, tools, versions, parameters, calibration selection, logs and generated artifact identities for each experiment.
- **Manual override:** users can override panel assignment, project progress and recommendations, with an audit trail and visible warnings when overridden data disagree with WCS.
- **Composable projects:** a mosaic is a type of astronomy project, not a disconnected feature. Existing collections may be linked but remain conceptually distinct.
- **Testable core:** domain calculations are pure TypeScript; I/O and external programs sit behind ports; no direct SQL or tool execution in React.

## 3. Feature A — Adaptive Integration Intelligence

### User problem

An observer may have six hours of data on a target but cannot determine whether another hour would meaningfully improve the result, which filter or panel deserves the next session, or whether marginal gains favour starting a different target.

### Capabilities

- Show **actual integration** (all acquired), **usable integration** (accepted lights), and **weighted equivalent integration** (explicitly modelled, not a blind sum).
- Analyse integration per target, filter/channel, session, equipment configuration, and mosaic panel.
- Estimate noise/SNR improvement when adding 30, 60, 120 minutes or a custom duration; for roughly comparable background-limited subs, use the square-root relation as an initial reference, and warn when its assumptions do not apply.
- Expose a **quality goal** selected by the observer (integration hours, reference SNR, target noise measurement or a specified minimum quality threshold). Avoid claiming a scientifically universal “finished” state.
- Forecast remaining exposure with a range when capture quality is variable; show model version, sample size and confidence/uncertainty.
- Prioritise the target/filter/panel with the largest expected improvement per usable observing hour, accounting for acceptance rate, existing integration and feasible observing windows.
- Recompute forecasts after ingestion, grading changes, stacks and experimental results. Compare prediction against measured result to calibrate the model.
- Offer a capture-plan export or recommendation; do not command hardware without a separate explicit integration.

### Important measurement distinction

Raw subframe SNR, stacked-image SNR, image aesthetics and subjective processing quality are not equivalent. Keep them separate. Weight and combine observations only under an explicit noise/throughput model; use actual calibrated master measurements when available. No invented “10 hours is complete” defaults.

### Suggested use cases

- `GetIntegrationSummary(targetId, filter?, panelId?)`
- `ForecastIntegrationGain(scope, addedMinutes, conditions?)`
- `SetQualityGoal(projectId, scope, goal)`
- `RankNextExposureActions(observingWindow)`
- `ReconcileIntegrationForecast(forecastId, observedResultId)`

### UI

On target and mosaic-panel pages show: accepted/total exposure, rejection rates, per-filter gaps, marginal improvement curve, assumption disclosure, “what another hour buys” and a link to relevant frames. On project pages aggregate the bottleneck panels instead of masking them with a project-wide total.

## 4. Feature B — Processing Experiment Lab

### User problem

A photographer wants to compare registration, rejection, background extraction, denoising, star removal, stretching or sharpening settings without repeatedly overwriting the same output or losing how each result was produced.

### Capabilities

- Create an **experiment** from a specific, immutable input manifest: accepted light IDs, calibration IDs, stack/master IDs and checksums.
- Define two or more **variants** with a recipe and explicit parameters; support stacking variants and post-processing variants separately.
- Validate external tool availability, compatible input type, free disk estimate, reproducibility information and tool-specific options before queueing jobs.
- Run through AstroRepo's existing job runner with cancel/resume rules. Display per-variant progress, logs, failures, and filesystem costs.
- Show side-by-side, synced zoom/pan, blink and split-slider comparisons with consistent colour-management/display stretches; allow matched regions of interest (ROI).
- Compare meaningful metrics: measured background noise, FWHM/star profile, clipping, gradients and detail-preservation proxies. Avoid treating any single metric as the definitive “winner”.
- Keep all generated outputs as derived artifacts, linked by provenance; mark one as preferred/published without deleting alternatives.
- Export a manifest/report summarising variants and observations. Support reproducibility when matching tool versions/models are available, and explicitly state when proprietary external tools prevent exact reproduction.
- Do not pass arbitrary shell commands through recipe metadata; allowlisted validated adapters only.

### Suggested use cases

- `CreateProcessingExperiment(inputManifest, objective)`
- `AddProcessingVariant(experimentId, recipe, parameters)`
- `ValidateProcessingVariant(variantId)`
- `QueueExperiment(experimentId)`
- `CompareExperimentOutputs(experimentId, roi?)`
- `SelectPreferredVariant(experimentId, variantId)`
- `ExportExperimentReport(experimentId)`

### MVP boundary

Start with **existing master + two post-processing variants** using supported tools and saved previews. Add alternative stacking algorithms, batch sweeps and automated ROI scoring later.

## 5. Feature C — Automated Astronomy Projects

### User problem

Multi-night and multi-target work is currently scattered across folders, lists and memories. Users need persistent plans that update themselves as actual FITS, stacked masters and published images become available.

### Project types

- **Catalogue campaign:** Messier, Caldwell, Sharpless or a curated target list.
- **Seasonal campaign:** targets observable in an operator-defined season or date interval.
- **Target depth:** one target with exposure goals by filter and quality.
- **Mosaic campaign:** one sky region divided into planned WCS panels, possibly captured over many sessions and rigs.
- **Personal collection:** manual target selection with configurable finished-image requirements.

### Capabilities

- Project wizard: title, targets/region, site, equipment profiles, dates, filters, intended outputs and completion rules.
- Per-target and per-panel tasks: **not observed**, **acquired**, **solved**, **partially covered**, **quality gap**, **ready to stack**, **processed**, **published**; distinguish workflow status from coverage percentage.
- Automatic reconciliation as existing assets are ingested, graded, solved, stacked or archived; no need to import the same frame again.
- Progress based on configurable definitions such as image published, minimum *usable* exposure per channel, geometric sky coverage and verified output existence.
- Project board, timeline, gallery and season opportunities; show blockers, incomplete channels and at-risk panels.
- Pause/archive project and export machine-readable manifest/CSV plus visual completion summary.
- Link to existing catalogue identities and collections without conflating “catalogue membership” with project task state.

### Suggested use cases

- `CreateAstronomyProject(definition)`
- `AddProjectTargets(projectId, targetIds)`
- `SetProjectCompletionRule(projectId, rule)`
- `ReconcileProjectProgress(projectId)`
- `GetProjectNextActions(projectId, window?)`
- `ExportProjectManifest(projectId)`

## 6. Feature D — Coordinate-based Mosaic Workspace

### Core vision

The user should be able to **draw a plan on the sky** and subsequently **see exactly where the FITS files they actually captured land on that same plan**. A mosaic is not merely a collection of images; it is a persistent world-coordinate layout with panel assignments, per-panel integration and real footprint coverage.

### D1. Plan a mosaic by celestial coordinates

1. Start from catalogue target, typed RA/Dec (explicit sexagesimal or decimal), existing solved FITS, or a chosen sky-map region.
2. Choose rig/optics: sensor pixel dimensions, pixel size or image scale, focal length, desired orientation/rotation, binning and expected field of view. Allow manual FOV overrides with indication of their source.
3. Define grid dimensions (rows × columns), overlap percentage in both directions (default suggestion **15%**, editable), central reference coordinate, grid rotation/position angle and optional per-panel overrides.
4. Render a WCS-aware sky projection with named panel footprints (`R1C1`, `R1C2`, etc.), centre RA/Dec, approximate corner coordinates and overlap outlines. Make convention for position angle explicit.
5. Drag the entire grid, rotate it, add/remove rows/columns, adjust spacing/overlap or adjust individual panel centres; reproject and recompute live rather than moving image pixels as the only source of truth.
6. Show region bounds, accessible catalogue overlays, target visibility and per-panel expected capture needs; mark panels outside reasonable altitude limits for selected observing windows.
7. Save a **versioned plan** and export exact panel centre coordinates, orientations and capture instructions as CSV/JSON. A future device-specific export adapter can adapt these coordinates to supported rigs.

**Astronomical correctness constraints**

- Store equatorial RA/Dec with explicit **ICRS reference frame** and angular units, separate from apparent/topocentric pointing coordinates if later required.
- Normalise RA wrapping at 0°/360°; validate declination −90° to +90°; handle fields near celestial poles and great-circle geometry.
- Derive footprints through a specified projection/transform appropriate to field size. Do **not** assume constant RA offsets in degrees across declinations; near poles, use spherical geometry or a vetted WCS library.
- Preserve orientation conventions and image axis handedness; distinguish planned rectangle/ideal field from measured, potentially skewed, distorted solved-image polygon.
- Persist plan revision so old captures remain traceable when panels are shifted. Reassignment after a revision requires review rather than silent mutation.

### D2. Map existing FITS files into planned mosaic grid

**Primary user story:** “I defined a 3×4 mosaic last month. I have already captured several FITS files over multiple nights. Show these FITS images on the planned 3×4 panel grid and tell me what is missing.”

Workflow:

1. Open a saved mosaic project. Display its planned panel outlines and a list of indexed FITS lights, registered masters and processed images relevant to the sky region.
2. Use each file's stored WCS, or invoke the existing ASTAP/Siril solve pipeline if absent, to compute centre, orientation, angular footprint and expected intersection with each planned panel.
3. **Auto-suggest assignments** using polygon/sky-footprint intersections and configurable thresholds; display match strength and evidence. Do not rely solely on nearest centre or file names.
4. Place a **registered preview thumbnail** of each assigned FITS/stack into the appropriate sky-coordinate location, not stretched to fill the panel rectangle. Make preview generation non-destructive; for raw FITS display use a clearly labelled temporary stretch.
5. Allow one FITS file to intersect **multiple** panels. Keep many-to-many geometric overlap records; optionally select a *primary* panel for operational grouping, while retaining all overlap facts.
6. Support manual drag/drop from the candidate FITS library to a panel, reassignment, exclude, multi-select, and “unassigned/unsolved/conflicting” trays. Show warning when manual placement contradicts WCS footprint.
7. Support multiple exposures, filters and nights per panel. The panel is not a single file slot: layer/filter views can show individual subs, master stacks, processed variants and their contributions.
8. Track actual captured **sky coverage**, good-frame integration per panel/filter, missing geometric regions, and coverage confidence. Do not report a panel complete merely because one FITS intersects it.
9. Show a composite **coverage view**: planned grid (thin outlines), actual captured WCS footprints (semi-transparent overlays), registered thumbnails, uncovered gaps and an exposure-density heatmap. Users can zoom from whole mosaic to single FITS provenance.
10. From missing/weak panels, produce next-session capture coordinates and required additional exposure, integrating Feature A.
11. Support completed mosaic output linked to the original plan, source frames and experiment variants. The final stitched image can be shown over the grid, but stitching is a later integration rather than a mandatory first release.

### D3. Mosaic workspace screen proposal

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Cygnus North America Mosaic       3 × 4  • 15% overlap  • Revision 2     │
│ [Plan] [Actual coverage] [Exposure heatmap] [Processed result]            │
├─────────────────────────────────────────────────────┬──────────────────────┤
│             SKY / WCS CANVAS                        │ FITS / LAYERS        │
│                                                     │                      │
│    ┌──────────┬──────────┬──────────┬──────────┐     │ Solved candidates    │
│    │ R1C1     │ R1C2     │ R1C3     │ R1C4     │     │ • light_001.fit      │
│    │ covered  │ partial  │ missing  │ covered  │     │ • light_002.fit      │
│    ├──────────┼──────────┼──────────┼──────────┤     │ • master_Ha.fit      │
│    │ R2C1     │ R2C2     │ R2C3     │ R2C4     │     │                      │
│    │ covered  │ covered  │ partial  │ missing  │     │ Unsolved (3)        │
│    ├──────────┼──────────┼──────────┼──────────┤     │ Conflicts (1)       │
│    │ R3C1     │ R3C2     │ R3C3     │ R3C4     │     │                      │
│    │ missing  │ partial  │ partial  │ covered  │     │ Selected: R2C2      │
│    └──────────┴──────────┴──────────┴──────────┘     │ Ha 2.4h / OIII 0.8h │
│  WCS polygons, matched FITS overlays, real gaps      │ [Inspect] [Assign]   │
├─────────────────────────────────────────────────────┴──────────────────────┤
│ [Re-solve files] [Review matches] [Export panel coordinates] [Plan next]  │
└────────────────────────────────────────────────────────────────────────────┘
```

The ASCII grid is illustrative only. The implemented canvas must render footprints in actual projected celestial coordinates; adjacent planned panels should overlap.

### D4. Data and coverage semantics

- **Plan extent:** union of planned panel sky polygons, not simply `rows × columns × FOV`.
- **Captured extent:** union of *solved* accepted light footprints or selected masters, computed according to user-selected layer/filter and quality criteria. Unsolved files are not counted as spatially covered.
- **Panel coverage:** area of intersection between accepted captured union and planned panel polygon divided by planned panel area; calculate in a consistent equal-area or spherical representation, or use sufficiently accurate calibrated sampling with documented precision.
- **Exposure map:** at each sky location, accumulated accepted exposure for contributing lights; separate channels, sessions and equipment profiles as required. Prevent double counting masters and their originating subs.
- **Completion:** a configurable conjunction of coverage threshold, minimum integration per filter, processing state and deliverable status; use different labels for *covered* versus *finished*.
- **Overlapping panels:** a FITS sub may count as spatial coverage for multiple panels without duplicating its physical capture duration in global exposure totals.
- **Display:** rendered preview resampling is not evidence of geometric coverage; WCS coordinates are authoritative.

### D5. Failure and edge conditions

| Condition | Expected behaviour |
|---|---|
| FITS has no valid WCS | Offer solve job; display in **Unsolved**, not confidently placed |
| WCS solve has low quality or unexpected orientation | Mark uncertain; permit review; retain original solve evidence |
| FITS matches two panels | Show both intersections; optional primary panel; never hide secondary overlap |
| User assigns a file manually despite WCS mismatch | Allow explicit override, reason and warning; retain WCS-computed footprint |
| Grid moves or is rotated after acquisition | Create new plan revision; show assignment changes before committing |
| RA crosses 0° or target approaches a pole | Spherical-coordinate-safe geometry; no broken ordering or offsets |
| FITS is archived or moved | Resolve through library's asset locator/checksum; show missing-file state rather than erasing assignments |
| Duplicate FITS present under multiple paths | Detect identity and avoid double counting integration |
| Master and its contributing subframes selected | Exclude duplicate contributions from summed exposure |
| Different rigs/cameras or rotations | Match with actual WCS and maintain equipment-specific integration diagnostics |
| Image partially outside grid | Clip visible footprint and account only for intersection |
| Missing/corrupt header/data | Quarantine or present actionable parse error; preserve originals |

## 7. Proposed domain model

Use the existing AstroRepo catalogue/frame/job/provenance IDs where available; the following are **conceptual extensions**, not mandated new tables.

```ts
interface AstronomyProject {
  id: string;
  kind: 'catalogue' | 'seasonal' | 'target-depth' | 'mosaic' | 'custom';
  title: string;
  targetIds: string[];
  completionRule: CompletionRule;
  status: 'active' | 'paused' | 'archived';
}

interface MosaicPlan {
  id: string;
  projectId: string;
  revision: number;
  frame: 'ICRS';
  centerRaDeg: number;
  centerDecDeg: number;
  positionAngleDeg: number;
  rows: number;
  columns: number;
  overlapXPercent: number;
  overlapYPercent: number;
  equipmentProfileId: string;
  panelIds: string[];
}

interface MosaicPanel {
  id: string;
  mosaicPlanId: string;
  row: number;
  column: number;
  centerRaDeg: number;
  centerDecDeg: number;
  positionAngleDeg: number;
  plannedFootprint: SkyPolygon;
  captureGoal?: IntegrationGoal;
}

interface SkyPolygon {
  frame: 'ICRS';
  vertices: Array<{ raDeg: number; decDeg: number }>;
}

interface MosaicAssetIntersection {
  planRevision: number;
  panelId: string;
  assetId: string; // Existing indexed FITS/master/image ID
  solveId?: string;
  intersectionAreaSqDeg: number; // valid only under a documented area computation
  panelCoverageFraction: number;
  assetIntersectionFraction: number;
  isPrimaryAssignment: boolean;
  source: 'computed' | 'user-override';
  reviewState: 'accepted' | 'needs-review' | 'excluded';
}

interface ProcessingExperiment {
  id: string;
  projectId?: string;
  inputManifestHash: string;
  variantIds: string[];
  preferredVariantId?: string;
}

interface IntegrationForecast {
  scope: { targetId: string; panelId?: string; filterId?: string };
  usableSeconds: number;
  predictedGain: number;
  estimateKind: string;
  assumptions: string[];
  uncertainty?: { lower: number; upper: number };
  modelVersion: string;
}
```

**Implementation note:** Prefer stable normalized entities and link tables over embedding all assets or observations in project JSON. `MosaicAssetIntersection` should be recomputable from versioned WCS and plan geometry; manual override should be stored separately so recalculation does not destroy user intent.

## 8. Architecture and integration

Maintain AstroRepo's existing **hexagonal architecture**:

| Layer | Suggested responsibilities |
|---|---|
| `packages/domain` | Sky-grid geometry, spherical footprint intersections, completion rules, forecast formulae, experiment definitions and invariants |
| `packages/application` | Plan/revise mosaic, reconcile WCS assets, compute coverage, forecast integration, manage experiments, project progress; ports for asset catalogue, solver, job runner, experiment store |
| `src/main/adapters` | SQLite persistence, existing FITS/WCS and ASTAP/Siril integration, derived preview generation and filesystem artifact manifests |
| Main process / IPC | Validated Zod request/response contracts; long-running solve, measurement and rendering jobs outside renderer |
| React renderer | Mosaic planning canvas, asset tray, panel inspector, integration forecast, experiment comparison, project board |
| `packages/testkit` | Fake frame index, deterministic WCS data, fake processors and contract suites |

### Reuse over replacement

Before adding endpoints, map the existing sky geometry and mosaic tile planning use cases, solved-frame assignment logic, library scanner and job/provenance APIs. Prefer introducing a `MosaicWorkspace` orchestration use case over implementing a second plate-solving service. Keep mosaics distinct from the **Messier mosaic gallery**, which displays one finished image per object, but let both share gallery assets and project links.

### Persistence and performance

- Persist plan revisions, panels, asset references, WCS solution identity, experiments, goal definitions and manual overrides in the existing SQLite migration flow.
- Spatial calculation can begin with a deterministic in-process geometry service; cache footprints/intersections keyed by `(planRevision, solveVersion, assetId)`.
- FITS previews are derived cache files with checksums; generate asynchronously and cap memory/cache sizes. Avoid opening gigabyte FITS in the renderer.
- Use background jobs for mass re-solves, thumbnail generation, ROI metrics and intersection recalculation; keep UI responsive.
- Provide a storage estimate and cleanup policies for experiment artifacts; deleting a derived artifact never deletes the original frame.

## 9. EARS requirements (initial traceability seed)

### Adaptive integration

- **AI-001** The system shall calculate acquired and accepted exposure independently for a selected target, filter and mosaic panel.
- **AI-002** When the user requests an additional-exposure forecast, the system shall show estimated gain together with model assumptions and input measurements.
- **AI-003** If observations cannot support a calibrated forecast, the system shall show a qualified theoretical estimate or an insufficient-data state rather than a precise unsupported value.
- **AI-004** When frame acceptance changes, the system shall invalidate dependent exposure forecasts and update project progress.

### Processing experiments

- **PE-001** When an experiment is created, the system shall persist the immutable input manifest identity and selected processing parameters.
- **PE-002** When a variant executes, the system shall record external tool/version, arguments, logs, exit status and output artifact identity.
- **PE-003** The system shall retain all successful variant outputs until the user explicitly removes derived artifacts.
- **PE-004** If a required processor is unavailable or an option is invalid, the system shall refuse execution and explain the missing prerequisite.

### Automated projects

- **AP-001** The system shall support user-defined project completion criteria for targets, channels and mosaic panels.
- **AP-002** When new files are indexed or solved, the system shall reconcile relevant projects without modifying source files.
- **AP-003** The system shall distinguish geometrically covered, sufficiently integrated, processed and published states.

### Mosaic planner and placement

- **MO-001** When a user creates a mosaic, the system shall generate persistable ICRS panel centre coordinates and planned sky footprints from the grid and equipment configuration.
- **MO-002** When the grid size, centre, angle, overlap or equipment changes, the system shall recalculate panel geometry and create a new revision when saved.
- **MO-003** Where planned geometry crosses RA 0° or approaches the celestial poles, the system shall preserve valid panel footprints and overlap calculations.
- **MO-004** When an indexed FITS has a valid WCS, the system shall calculate its actual footprint and candidate panel intersections.
- **MO-005** When a FITS intersects multiple panels, the system shall preserve all geometric intersections and may additionally store a primary operational assignment.
- **MO-006** If a FITS lacks a valid WCS, the system shall mark it unsolved and offer plate solving without pretending its location is known.
- **MO-007** When the user opens actual-coverage mode, the system shall display planned grids and actual FITS footprints in the same sky-coordinate projection.
- **MO-008** When the user selects a panel, the system shall display contributing accepted light frames, available masters, integration per channel, coverage and provenance.
- **MO-009** When a user manually overrides a WCS-derived assignment, the system shall store the override separately and flag significant geometric discrepancies.
- **MO-010** When the user changes a saved mosaic plan, the system shall preserve earlier revisions and expose any affected file assignments for review.
- **MO-011** The system shall not count the same source exposure twice merely because its footprint overlaps multiple panels or because a master and its input subs are both visible.
- **MO-012** When users export a capture plan, the system shall include each panel's stable identifier, ICRS centre coordinates, orientation, footprint and plan revision.
- **MO-013** When a source file becomes unavailable, the system shall retain its identity, last WCS geometry and missing-file status without silently marking it present or usable.

## 10. BDD scenarios (examples)

```gherkin
Feature: Place actual FITS captures onto a planned mosaic

  Scenario: Solved light is shown at its actual footprint
    Given a saved 2 by 2 mosaic plan in ICRS coordinates
    And an indexed light FITS with a valid WCS overlapping panel R1C2
    When the user opens the mosaic actual coverage view
    Then the FITS preview is overlaid at its solved sky coordinates
    And panel R1C2 lists the FITS as a contributing asset
    And the original FITS file is unchanged

  Scenario: One FITS overlaps two planned panels
    Given a FITS footprint intersects panels R1C1 and R1C2
    When the application reconciles mosaic assignments
    Then both geometric intersections are retained
    And global physical exposure time is not counted twice

  Scenario: Unsolved FITS cannot falsely complete a panel
    Given an indexed FITS without a valid WCS
    When the application calculates mosaic coverage
    Then the FITS appears in the unsolved tray
    And it adds no claimed geometric coverage
    And a plate-solve action is available

  Scenario: Saved grid changes preserve history
    Given a saved mosaic plan at revision 1 with assigned captures
    When the user rotates the grid and saves the changes
    Then the application creates revision 2
    And revision 1 remains available
    And any changed assignments are flagged for review

Feature: Adaptive integration for mosaic panels

  Scenario: Recommend exposure for a weak channel
    Given a panel with accepted Ha exposure and lower OIII exposure
    And a project completion goal per filter
    When the user requests the next observation recommendation
    Then the application compares remaining exposure needs
    And explains the data and assumptions behind its recommendation

Feature: Reproducible processing experiments

  Scenario: Compare two variations without overwriting source
    Given an immutable input master manifest
    When the user runs two supported processing variants
    Then each variant records parameters and output artifacts
    And the user can compare the results at matched zoom
    And the original master remains unchanged
```

## 11. Testing strategy

- **Unit/property:** spherical geometry, coordinate normalisation, stable grid identifiers, deterministic overlap, panel coverage in [0, 1], monotonic exposure under added accepted unique frames, revision semantics.
- **Fuzz:** RA wrap, extreme declinations, large rotations, odd image orientations, near-tangent intersections, degenerate WCS, unexpected FITS header values, empty grids, huge overlap percentages.
- **Contract:** SQLite repositories, FITS/WCS adapters, plate-solve and job ports; ensure fake adapters obey same behaviours.
- **BDD:** link each `AI-*`, `PE-*`, `AP-*`, `MO-*` requirement to executable scenarios consistent with the repository's EARS traceability gate.
- **Integration:** use a small fixture set of real, permissibly redistributable FITS headers/images with known WCS and expected mosaic placements. Validate reference results against an independent astronomical WCS implementation.
- **Mutation:** prioritise overlap boundary conditions, duplicate-exposure prevention, rejected-frame filtering and completion criteria.
- **Visual:** pan/zoom stability, thumbnail sky alignment and equivalent WCS output across screen resolutions.
- **Nonfunctional:** large-frame thumbnail generation remains off the UI thread; job cancellation works; rescan/idempotence does not duplicate intersections; source files are never modified.

## 12. Delivery roadmap

| Slice | Deliverable | Dependency | Exit criterion |
|---|---|---|---|
| 0 — Architectural reconnaissance | Existing-type and migration map; fixtures; UI wireframes | Existing AstroRepo | No duplicate subsystem proposed |
| 1 — Mosaic geometry | Versioned editable coordinate grid; ICRS centres/footprints; CSV/JSON export | Existing sky planner | Accurate geometry including RA wrap/high declination |
| 2 — FITS assignment | WCS footprint placement; candidate/unsolved trays; multi-panel intersections and manual review | Existing FITS catalogue and solver | Existing captures appear at actual solved positions on saved grid |
| 3 — Coverage intelligence | Panel/union coverage, per-filter exposure, heatmap, gaps, no double counting | Slices 1–2 + grading | Explainable coverage and missing-data report |
| 4 — Astronomy projects | Project wizard, mosaic campaign, progress criteria, next actions | Slices 1–3 | Progress reconciles on ingest/solve/grade |
| 5 — Adaptive integration | Marginal-gain predictions per target/channel/panel | Frame metrics, coverage | Quality-qualified forecast linked to provenance |
| 6 — Processing Experiment Lab | Two-variant post-processing experiment, manifest, review and comparison | Existing job runner and provenance | Reproducible comparison; inputs preserved |
| 7 — Advanced workflows | Full processing sweeps, stitched mosaic result, multi-rig panel plans | Earlier slices | Opt-in, separately justified enhancements |

**Suggested MVP:** slices **1–3** first, because the most distinctive requirement is seeing real FITS files occupying a previously defined coordinate grid. Then deliver **4–6** on the common model. Existing capabilities should be incrementally adapted, not reimplemented.

## 13. Explicitly out of initial scope

- Autonomous telescope control, guiding, mount safety or meridian-flip execution.
- Guaranteed scientific photometric calibration or universal perceptual-quality scores.
- Automatic FITS editing, relocation or deletion.
- Seamless full-resolution image stitching/blending in the first mosaic release; initially integrate with supported existing tool chains or link a generated result as an artifact.
- An AI model deciding geometry, processing quality or coverage without deterministic verification.

## 14. Open design decisions

1. Which existing mosaic grid/plate-solve types can be promoted to stable persistent entities rather than wrapped?
2. What is the canonical WCS parser and coordinate transform, and how will reference solutions be independently verified?
3. Should asset-panel assignment require an explicit user acceptance threshold, or auto-accept high-confidence computed overlaps with an undo/review path?
4. Which per-filter completion thresholds are most useful as optional defaults without implying universal scientific correctness?
5. Do project goals primarily reference *light frame* integration, processed master quality, spatial coverage, or a configurable conjunction? **Recommendation: conjunction with separately reported components.**
6. How should different sensor profiles and rigs share one grid—common sky footprint with per-rig acquisition export, or per-rig subplans? **Recommendation: common sky plan with per-rig capture configurations.**
7. Which mosaic rendering library supports accurate WCS display while remaining efficient in Electron? Prototype with small fixtures before choosing.
8. How will archived/offline FITS retain last-known coverage without being represented as currently accessible?

## 15. Definition of done

The proposal is complete when a user can create a persistent sky-coordinate mosaic, export panel coordinates, ingest previously captured FITS, solve or review their positions, **see each FITS in its actual place over the defined grid**, identify uncovered/underexposed panels, plan additional integration, and track the result within a reusable astronomy project. They can also compare processing variants while retaining a full input/output provenance trail. At every step the original FITS files remain untouched.
