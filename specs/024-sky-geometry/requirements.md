# 024 Sky geometry: requirements

This is slice D, the fifth of the SyQon-inspired slices (see the roadmap). SyQon Studio plate
solves every image and plans mosaics on the sky. Astrorepo hands the solving to ASTAP, or to
Siril's own solver when ASTAP is not installed, and builds the same habits around the solves:
- every light night and every master knows where it points;
- a target whose files point somewhere else is flagged;
- a target too big for one field gets a mosaic plan with the nights it can be shot;
- lights that cover the same mosaic are grouped as its panels.

## What this slice delivers

- **Plate solving.** **Plate solve** on a target's Overview queues one background job in Jobs.
  The job solves one light from each folder of each night, and every master, that is not placed
  yet. It uses ASTAP when the tool hub finds it and Siril otherwise. A file whose headers already
  carry a WCS is placed from its headers without solving. Each solve stores:
  - the centre (RA and Dec);
  - the rotation;
  - the pixel scale and the field's width and height;
  - the solver and when it ran;
  - or why it failed.
- **What the solves say.** The target's Overview has a **Where it points** card. It lists each
  solved file, says when most of them point further from the catalogue position than their field
  is wide ("may be filed under the wrong name"), and shows each night's field rotation.
- **A mosaic planner** on the Sky planner. For a target larger than the field of view, it uses
  the catalogue size and the field of view of the scope and camera picked from Equipment. It
  proposes:
  - a grid of panels with at least 15% overlap at the chosen rotation;
  - each tile's centre as RA hh:mm:ss and Dec ±dd:mm:ss;
  - the hours each tile still needs for the target's goal;
  - the coming nights on which every panel clears the altitude limit.

  **Export CSV** saves the tiles and **Save plan** keeps the plan for the target.
- **Panels.** Lights whose solved fields overlap each other or a planned tile are grouped as the
  panels of one mosaic, with the integration each tile has. Another target whose lights are
  panels of the mosaic is linked to it (the existing `part_of_mosaic` relationship). Next actions
  says "tile N has no lights" for a saved plan, with the coming nights the tile is visible.

## Changes to the blueprint

- **ASTAP first, Siril as fallback.** Leigh asked for both. The tool hub gains ASTAP (`astap_cli`
  or `astap`). A preferred solver picks ASTAP when it is found and Siril's `platesolve` when it is
  not. A missing star database is reported as the solver says it, as a failed solve; checking the
  catalogues each tool needs is slice N's work.
- **Solve a copy, never the source.** Both solvers write beside the image (ASTAP its `.ini` and
  `.wcs`), so each file is hard linked, or copied when a link is not possible, into
  `solve/<target>` in the work area. The solve runs there, and everything named `solve.*` is
  removed afterwards. Neither solver is asked to write into the image.
- **One solve job per target, not per file.** A target can have hundreds of nights and folders,
  so one job solves them one after another, shows which file it is on, and skips files already
  stored. Solves are short, so the job runs as soon as nothing else runs rather than waiting for
  the run window.
- **One light per folder per night.** The blueprint said one light per night. A mosaic's panels
  are usually captured into folders of their own on the same night, so the app solves one light
  from each folder of each night, which is what grouping panels needs.
- **Equipment gives the field of view.** The planner calls the Equipment page's own field of view
  for the scope, camera and reducer picked. With none picked it uses the target's solved lights,
  and with neither it asks for equipment.
- **Rotation is compared modulo a half turn.** A meridian flip turns the field by 180°, which
  stacking handles, so only other turns are called out.

## Plate solving

| ID | Pattern | Requirement |
|----|---------|-------------|
| SKY-001 | Ubiquitous | The system shall plate solve a file by handing a hard link or copy of it in the work folder to ASTAP's command line or to Siril's own solver, and store the centre, rotation, pixel scale and field size it reads from the solver's result with the solver and the time, or why the solve failed. |
| SKY-002 | Ubiquitous | The system shall solve with ASTAP when the tool hub finds it, with Siril when only Siril is found, and say that neither is set up when neither is found. |
| SKY-003 | Event | When the user asks to plate solve a target, the system shall queue one background job that solves one light from each folder of each night and every master not yet placed, show the file it is on, and skip files already stored when it runs again. |
| SKY-004 | Optional | Where a light or master already carries a WCS in its headers, the system shall store its field from those headers without solving it. |

## What the solves say

| ID | Pattern | Requirement |
|----|---------|-------------|
| SKY-005 | Unwanted | If most of a target's solved files point further from the catalogue position of its name than the larger side of their field, then the system shall flag that the target may be filed under the wrong name and say how far off they point. |
| SKY-006 | Ubiquitous | The system shall show each night's field rotation on a target's page and say when two nights differ by more than 2°, counting a half turn as a meridian flip. |

## Mosaic planner

| ID | Pattern | Requirement |
|----|---------|-------------|
| SKY-007 | Event | When the user plans a mosaic for a target larger than one field, the system shall propose a grid of panels from the catalogue size and the field of view of the chosen equipment with at least 15% overlap at the chosen rotation, and list each tile's centre as RA hh:mm:ss and Dec ±dd:mm:ss with the hours it still needs for the target's goal. |
| SKY-008 | Event | When a mosaic is planned and the site is set, the system shall mark the coming nights on which every panel stays above the altitude limit for at least the minimum usable hours. |
| SKY-009 | Event | When the user exports a mosaic plan, the system shall save its tiles as CSV with each tile's centre and the hours it still needs. |
| SKY-010 | Unwanted | If the target has no catalogue position or size, or no field of view is known, then the system shall say what is missing and propose no grid; a target that fits one field shall get one tile and be told so. |

## Panels

| ID | Pattern | Requirement |
|----|---------|-------------|
| SKY-011 | Ubiquitous | The system shall group solved lights whose fields overlap each other or a planned tile as the panels of one mosaic, show the integration each tile has, and link any other target with such lights to the mosaic's target as part of its mosaic. |
| SKY-012 | State | While a saved mosaic plan has a tile with no lights, the system shall say in Next actions that the tile has no lights, with the coming nights on which it clears the altitude limit. |

## Quality

| ID | Pattern | Requirement |
|----|---------|-------------|
| NFR-018 | Ubiquitous | The system shall write a solve's copy and the solver's result files only inside the work folder, remove them after each solve, and run every solver with an argument array, never a shell. |
