# 014 Stacking plan and disk space: requirements

First part of slice C3 (recipes). Before Prep for Siril writes anything, each target's page says
which of Siril's stock preprocessing scripts fits its frames, how much disk that script needs,
stage by stage, and whether the work area's disk has room.

## What this slice delivers

- A **Stacking plan** panel on a target's page, next to Prep for Siril: the recommended script,
  why it was picked and which frames it leaves out, the frames it will use, the space it needs,
  the free space on the work area's disk, and whether it fits (or by how much it is short).
- Every other stock script for the same sensor, with its size and the calibration it is missing,
  and a stage-by-stage breakdown for each.

## Changes to the blueprint

- **Recipes start with space, not a Run button.** Leigh's Siril_Scripts repo has a space
  estimator he relies on, and a stack that runs out of disk halfway wastes a night's processing.
  The stage sizes follow `utilities/space_estimator.py` in
  [lgriffin/Siril_Scripts](https://github.com/lgriffin/Siril_Scripts), reimplemented in the
  domain so the app estimates from its own index, before the work folder exists, and credits
  hard-linking (which costs nothing).
- **Siril's stock scripts, not copies of them.** The app names the script (for example
  `OSC_Preprocessing.ssf`, shipped with Siril) rather than bundling any `.ssf`; Siril_Scripts is
  GPL-3.0 and stays where it is. Post-processing with Siril_Scripts v2, and running scripts from
  the app, follow in the next parts of the slice (and slice G).
- **Sensor type comes from the header.** A light with a Bayer pattern (BAYERPAT) is colour;
  indexed lights without one are mono; frames never indexed are taken as colour, since the
  Seestar and the Vespera are colour cameras.

## Stacking plan

| ID | Pattern | Requirement |
|----|---------|-------------|
| RCP-001 | Ubiquitous | The system shall recommend, for a target's frames, the stock Siril preprocessing script for its sensor that uses the most of its calibration frames, saying why and which frames it leaves out. |
| RCP-002 | Ubiquitous | The system shall estimate, stage by stage, the disk space each stock Siril preprocessing script for the target's sensor needs with every intermediate file kept, plus what Prep for Siril must copy. |
| RCP-003 | Unwanted | If a script needs more than the free space on the work area's disk, less what an earlier run left in its process and masters folders, then the system shall say by how much it is short. |
| RCP-004 | Unwanted | If the lights' dimensions are not in the index, then the system shall estimate them from file size and mark the figures as approximate. |
| RCP-005 | Unwanted | If a script needs calibration frames the target does not have, then the system shall name the missing folders. |

## Non-functional

| ID | Pattern | Requirement |
|----|---------|-------------|
| NFR-010 | Ubiquitous | The system shall make the stacking plan without writing to the source folder or the work area. |
