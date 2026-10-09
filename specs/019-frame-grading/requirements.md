# 019 Frame grading: requirements

Slice Q1, the first of the SyQon-inspired slices (see the roadmap). SyQon Studio's Fusion Stack
measures every subframe before it integrates. Astrorepo hands stacking to Siril, so it measures and
grades each light itself and lays only the kept ones out for Siril. This answers the question
Leigh puts first: what is hidden in the files, frame by frame.

## What this slice delivers

- **1 · Grade the lights** opens a target's Stack and process: Measure lights (a batch at a time,
  with Stop), each night and filter with its median FWHM and stars and a trend of FWHM and star
  count in capture order, every frame's measurements, grade and reasons, a keep or reject choice
  per frame, and Export CSV.
- **Settings > Frame grading**: the limits every light is graded against.
- The **stacking plan** counts only kept lights and says how many grading left out; **Prep for
  Siril** and queued stacks place only kept lights and remove any rejected since an earlier run.

## Changes to the blueprint

- **Measured by the app, not by Siril.** Siril's `seqpsf` and registration statistics need a
  sequence Siril has already converted, which writes to the work area. Measuring the lights
  where they are reads them only and works before any work area exists.
- **Judged against the night, not one fixed number.** A soft night or a narrowband filter would
  otherwise reject every frame. Eccentricity and an optional FWHM in pixels are absolute.
- **Pixels, not arc seconds.** FWHM is reported in the frame's own pixels. Arc seconds need the
  image scale, which slice D's plate solves will give.
- **The legacy quality columns stay.** The FITS files page's quick quality score
  (`services/quality.ts`) is left as it is; grading lives in its own table, keyed by path so a
  rescan keeps it.

## Grading

| ID | Pattern | Requirement |
|----|---------|-------------|
| GRD-001 | Ubiquitous | The system shall measure each light's FWHM, eccentricity, star count, background, noise and SNR from its pixels, reading the source file only. |
| GRD-002 | Ubiquitous | The system shall measure a colour sensor's raw lights on 2×2 binned luminance, so the Bayer pattern is not taken for stars, and report FWHM in the frame's own pixels. |
| GRD-003 | Event | When a light fails a grading limit, the system shall mark it rejected and name each limit it failed. |
| GRD-004 | Ubiquitous | The system shall judge FWHM, star count and background against the median of the light's own night and filter. |
| GRD-005 | Event | When the user keeps or rejects a light by hand, the system shall use that choice over the limits until the user clears it. |
| GRD-006 | Ubiquitous | The system shall weight each kept light by its SNR squared, relative to the target's best kept light. |
| GRD-007 | Event | When a stack is estimated, laid out or queued, the system shall leave rejected lights out and remove any an earlier run left in the work area. |
| GRD-008 | Event | When the user exports grades, the system shall write one CSV row per light with every measurement, the verdict and its reasons. |
| GRD-009 | Ubiquitous | The system shall show each night's FWHM and star count in capture order, as the first step of a target's Stack and process. |
| GRD-010 | Event | When the user saves grading limits in Settings, the system shall grade every light again without measuring it again. |
| GRD-011 | Unwanted | If a light cannot be measured, then the system shall show it as not measured with the reason and keep it in the stack. |

## Non-functional

| ID | Pattern | Requirement |
|----|---------|-------------|
| NFR-014 | Ubiquitous | The system shall measure lights in small batches, so the app stays responsive and the user can stop between batches. |
