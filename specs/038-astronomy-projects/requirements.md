# 038 Astronomy projects: requirements

Slice 4 of the observation intelligence proposal
([docs/proposals](../../docs/proposals/observation-intelligence-and-mosaics.md), section 5). A
project is a campaign over targets, or over a mosaic's panels, with a rule for what finished means.
Its progress is never stored: it is worked out from the index each time it is asked, so new files
count as soon as they are scanned, graded, solved or stacked. The IDs AP-001 to AP-003 are the
proposal's; AP-004 onwards are added here.

## What slice 4 delivers

- **Projects** under Collections lists every project with how many of its tasks are done, and
  starts a new one of five kinds:
  - **Catalogue campaign**: a catalogue's targets in designation order, linked to the catalogue;
  - **Seasonal campaign**: targets picked by hand and a window of two dates;
  - **Target depth**: one target;
  - **Mosaic campaign**: one mosaic workspace (spec 037), its panels and its target;
  - **Personal collection**: targets picked by hand, a collection's targets, or both.
- **What finished means** is a rule of separate parts, each asked or not:
  - usable light per filter, as each target's own goals or the same goals for every target (or panel);
  - every panel covered (mosaic campaigns only, at spec 037's 95%);
  - a stack, a processed file, a finished image.
- A project's page shows each task (a target, or a mosaic's panel plus its target for the outputs)
  with its stage, every asked part met or not and why, light per filter against the goals, and one
  next step. The parts are tallied one by one beside the done total.
- **Next steps** lists one step per unfinished task: setting goals, finishing an image, processing
  and stacking first, since they need no sky, then captures with the least still to capture first.
- A project is paused, archived or made active again; it can take or drop targets (except a target
  depth project and a mosaic campaign), take the members its catalogue or collection gained, and be
  exported as a manifest in CSV or JSON.

## Changes to the proposal

- The proposal's task states (not observed, acquired, solved, partially covered, quality gap, ready
  to stack, processed, published) are split in two, as AP-003 asks: a target's **stage** is the
  furthest of not observed, acquired, stacked, processed and published, and a panel's is spec 037's
  not started, partly covered or covered; "quality gap" and "ready to stack" are the integration and
  stack parts of the rule, reported apart.
- Usable light at target level is the light the quality analysis does not flag for rejection, as the
  Stacks page counts it. Copies and masters over their lights are only taken out on a mosaic's
  panels, where spec 037 counts each frame once.
- Next steps are not ranked by tonight's sky yet; slice 5 (forecasts, spec 039) ranks exposure by
  what it buys.
- No default goals are invented: a rule that asks for each target's own goals finds a target without
  any unmet, with "Set integration goals" as its step.
- A mosaic without a target cannot ask for a stack, a processed file or a finished image, since
  they are found by target.

## Changes since

- Spec 039: usable light now follows grading (a keep or reject on the quality card counts), and
  the project's page lists its bottlenecks by what the next hour buys.

## Requirements

| ID | Pattern | Requirement |
|----|---------|-------------|
| AP-001 | Ubiquitous | The system shall support user-defined project completion criteria for targets, channels and mosaic panels: usable light per filter (each target's own goals or goals set for the project), coverage of every panel, a stack, a processed file and a finished image, each asked or not. |
| AP-002 | Event | When new files are indexed, graded, solved or stacked, the system shall reconcile relevant projects the next time they are asked, from the index as it is then, without importing any file again or modifying source files. |
| AP-003 | Ubiquitous | The system shall distinguish geometrically covered, sufficiently integrated, stacked, processed and published states, report each part of a project's rule for each task on its own, and tally each part apart from the number of tasks done. |
| AP-004 | Event | When the user starts a project, the system shall make it one of five kinds (catalogue campaign, seasonal campaign, target depth, mosaic campaign, personal collection), bringing in a catalogue's or collection's targets linked to it without changing it, a mosaic's panels and target, or the targets picked. |
| AP-005 | Event | When the user opens an active project, the system shall give one next step per unfinished task (the earliest missing of goals, light, coverage, a stack, processing and a finished image), steps that need no sky first, then captures with the least still to capture first. |
| AP-006 | Unwanted | If a project is started or its rule changed without a name, without the catalogue, window, single target or mosaic its kind needs, with a window that ends before it starts, with targets the index does not know, with coverage outside a mosaic campaign, with a goal of no time or no filter, or asking for nothing, then the system shall refuse it, keep nothing and say what is wrong. |
| AP-007 | Event | When the user exports a project, the system shall write a manifest as CSV (one row per task with its stage, each part and its next step) or JSON (the rule, the tallies and each task with its light per filter), named from the project. |
| AP-008 | State | While a project is paused or archived, the system shall keep working out its progress and shall suggest no next steps for it. |
| AP-009 | State | While a seasonal campaign is before, inside or after its window, the system shall show how many days until it starts, how many days are left counting today, or that it has closed. |
| AP-010 | Unwanted | If a rule asks for each target's own goals and a target (or a mosaic's target) has none, then the system shall not count its integration as met and shall ask for goals as its next step. |
| AP-011 | Event | When a project's catalogue or collection gains targets the project does not have, the system shall say how many and add them when the user asks; targets the user took out of the project are not offered back. |
| AP-012 | Unwanted | If the user adds a target to or takes one out of a target depth project or a mosaic campaign, then the system shall refuse it and keep the targets it has. |
