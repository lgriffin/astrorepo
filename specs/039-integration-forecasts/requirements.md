# 039 Integration forecasts: requirements

Slice 5 of the observation intelligence proposal
([docs/proposals](../../docs/proposals/observation-intelligence-and-mosaics.md), section 3). It
says what a target, a filter or a mosaic panel has, acquired and accepted apart, and what more
capture is expected to buy, with the model, its assumptions, its inputs and a range, never a bare
number. The IDs AI-001 to AI-004 are the proposal's; AI-005 onwards are added here.

## What slice 5 delivers

- A target's **Stack and process** tab has **What another hour buys**, under the grading card:
  - for each filter: frames and the share rejected, acquired and accepted time, the goal and the
    capture still needed to reach it with a range;
  - the expected gain in signal to noise from 30 minutes, an hour and two hours more, or a length
    the user types, each with its range and its kind (measured, theoretical, not enough data);
  - the filter the next hour helps most, and **What this rests on**: the assumptions, the model
    and the frames it was worked out from.
- A mosaic's page has the same per panel and filter, from the frames its coverage counts.
- A project's page lists its **bottlenecks**: the filters of unfinished targets and panels still
  short of their goals, by what the next hour buys, most first.
- A project's usable light now follows grading (spec 019), so a keep or reject changes its
  progress and its forecasts the next time they are asked.

## The model (sqrt-v1)

- Signal to noise grows with the square root of accepted exposure, for comparable subs limited by
  sky background. An hour more is expected to be accepted at the rate so far.
- Once at least 10 kept frames are measured, accepted exposure is weighted by each frame's star
  SNR² against the median kept frame (unmeasured kept frames at weight 1), and the range also
  spans the 10th to 90th percentile of that weight.
- The range always spans the 90% Wilson interval of the acceptance so far.
- With nothing accepted there is no number. With fewer than 10 frames, or frames not measured, the
  forecast is marked theoretical.

## Changes to the proposal

- Forecasts are worked out each time they are asked, from grading and coverage as they are then,
  so there is nothing to invalidate (AI-004). Comparing a forecast with a measured result to
  calibrate the model (`ReconcileIntegrationForecast`) waits until stacked masters are measured; the
  model is named on every forecast so later ones can be told apart.
- Quality goals stay per-filter integration goals (spec 038 and the Stacks page); a target noise or
  SNR goal waits for the same master measurements.
- Ranking does not yet weigh tonight's usable hours; Next actions and the Sky planner keep doing
  that. Panel forecasts are always theoretical, since coverage counts frames capture by capture
  rather than measuring each.

## Requirements

| ID | Pattern | Requirement |
|----|---------|-------------|
| AI-001 | Ubiquitous | The system shall calculate acquired and accepted exposure independently for a selected target, each of its filters and each mosaic panel and filter, with the frames and the share rejected. |
| AI-002 | Event | When the user requests an additional-exposure forecast, the system shall show the estimated gain in signal to noise together with its range, the model's name, its assumptions and the input measurements it rests on. |
| AI-003 | Unwanted | If observations cannot support a calibrated forecast, then the system shall show a qualified theoretical estimate, or an insufficient-data state with no number when nothing is accepted, rather than a precise unsupported value. |
| AI-004 | Event | When frame acceptance changes, the system shall work out dependent exposure forecasts and project progress again from the new acceptance the next time they are asked. |
| AI-005 | Event | When a filter has a goal, the system shall show the accepted exposure still needed and the capture time that takes at the acceptance so far, with a range, and shall not claim a capture time while nothing is accepted. |
| AI-006 | Event | When the user looks at a target, a mosaic or a project, the system shall rank its filters, its panels' filters or its unfinished tasks' short filters by the gain expected from the next hour of capture, most first, those with nothing accepted after. |
| AI-007 | Ubiquitous | The system shall report a weighted equivalent integration, by star SNR² against the median kept frame, only once at least 10 kept frames are measured, and shall base measured forecasts on it. |
| AI-008 | Event | When the user types a capture length, the system shall forecast every filter of the target for exactly that length beside the usual 30 minutes, one hour and two hours. |
