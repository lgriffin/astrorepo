# 020 Stacking advice: requirements

This is slice Q2, the second of the SyQon-inspired slices (see the roadmap). SyQon Studio's Fusion
Stack manual explains the choices behind a stack: memory, drizzle, rejection, calibration matching
and sessions. Astrorepo keeps Siril's stock scripts and gives the same advice beside the stacking
plan, built from what the index and frame grading already know. Planning also learns which filter
a narrowband target is short of.

## What this slice delivers

- **Memory per script.** Each script in the stacking plan says how much memory it needs to stack
  in one pass. It also says whether the PC has that much free, whether Siril will fall back to
  slower blocks, or whether the PC is short and what to do about it.
- **Stacking advice**, an expandable section under the plan, which covers:
  - the image scale;
  - whether Bayer drizzle is worth it and the extra disk it costs;
  - the rejection that suits the number of kept lights, as Siril's `rej` arguments;
  - whether the darks, flats and biases match the lights, and what differs when they do not;
  - each night's lights, kept lights, median FWHM and flats, with **Leave out** and **Use again**
    per night.
- **Channel balance in planning.** When a filter has under a third of the integration of the
  target's best-covered filter, tonight's plan and the next actions suggest shooting it. For
  example: "Capture OIII: it has 40 m against 6 h of Ha."

## Changes to the blueprint

- **Advice, not new scripts.** Siril's stock scripts take their rejection and drizzle settings as
  written. The plan names the right `rej` arguments and when to use the Bayer drizzle script; it
  does not rewrite scripts. Custom scripts belong to slice P1's provenance work.
- **Memory is estimated, not measured.** The estimate follows how Siril integrates. One pass holds
  every light as 32-bit floats. The minimum works in blocks of at least 32 rows. Siril's default
  memory ratio is 0.9. The check compares this with the memory free now and with the PC's total,
  because the night run window usually finds the PC idle.
- **The Seestar needs no calibration frames.** It subtracts darks on board, so a Seestar target
  with no darks, flats or biases is told none are needed, not that they are missing.
- **Nights reuse grading.** A night is left out by rejecting its lights by hand (GRD-005). Using
  it again hands them back to the limits, so the grading page and the stack always agree.

## Memory

| ID | Pattern | Requirement |
|----|---------|-------------|
| ADV-001 | Event | When a stack is estimated, the system shall show for each script the memory needed to stack its kept lights in one pass and the least it can stack with. |
| ADV-002 | Unwanted | If the PC's free memory is below what one pass needs, then the system shall say Siril will stack in slower blocks, or, below the least, that it is short and whether closing other programs or stacking fewer lights at a time will do. |

## Advice

| ID | Pattern | Requirement |
|----|---------|-------------|
| ADV-003 | Ubiquitous | The system shall work out the image scale in arc seconds per pixel from the lights' FOCALLEN and XPIXSZ, using the scale most lights share. |
| ADV-004 | Optional | Where the lights are colour, coarser than 2"/px and at least 100 are kept, the system shall suggest the Bayer drizzle script with the extra disk it needs; otherwise it shall say why not. |
| ADV-005 | Ubiquitous | The system shall check each kind of calibration frame in a stack's folder against its lights' exposure, gain, sensor temperature and filter, and, when no frame of a kind matches, name what differs on the nearest one. |
| ADV-006 | State | While every light comes from a Seestar, the system shall say no darks, flats or biases are needed rather than that they are missing. |
| ADV-007 | Event | When grading is available, the system shall list each observing night's lights, kept lights, median FWHM and flats, and say when some nights have no flats of their own. |
| ADV-008 | Event | When the user leaves a night out, the system shall reject its lights by hand; when the user uses it again, the system shall hand them back to the grading limits. |
| ADV-009 | Ubiquitous | The system shall advise the rejection that suits the number of kept lights: none under 3, percentile under 10, Winsorized sigma under 50, and generalized ESD from 50, with Siril's `rej` arguments. |

## Planning

| ID | Pattern | Requirement |
|----|---------|-------------|
| ADV-010 | Event | When a target's least-captured filter has under a third of the integration of its most-captured filter, the system shall suggest capturing that filter next, with both totals. |
