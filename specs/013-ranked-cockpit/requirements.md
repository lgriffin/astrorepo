# 013 Ranked cockpit: requirements

Slice C2 of the cockpit blueprint. The dashboard's list of suggestions becomes **Next actions**: one
ranked to-do list that mixes what to shoot tonight (from the forward plan, spec 012) with what to
stack (spec 009 and 010), in the order it is worth doing.

## What this slice delivers

- Tonight's targets appear as **shoot tonight** actions, each saying how long it is up above 30°,
  how close the moon comes, how many days its season has left when it is closing, and how far it
  is from its integration goal.
- The list is ranked: captures whose season is closing first (soonest first), then tonight's other
  captures (most usable hours first), then stacking suggestions (most unprocessed integration
  first).
- On a night with nothing to shoot (bright moon without a narrowband filter, no dark window, or no
  site set) the list leads with stacking, so there is always something to do.

## Changes to the blueprint

- **Captures before stacking.** The blueprint ranked by unprocessed hours alone. A night passes and
  stacking can happen any day, so time-bound captures lead. Stacking suggestions keep their own
  order among themselves (spec 009, unchanged).
- **Capture actions are not dismissible.** They are recomputed every night, so there is nothing
  lasting to dismiss; stacking suggestions stay dismissible (DSC-009).
- **Other checks keep their own section.** Calibration, integration-goal and quality warnings from
  the older recommendation service sit under their own heading, so eight to-do items never push
  a missing-darks warning out of sight.
- **Goal shortfall is per filter.** Goals are set per filter, so a filter past its goal never
  makes up for one that is short (this also decides whether a target has work left for planning).
- **Next actions compute only tonight and the next month of nights**, not the year-ahead season
  table, and load separately so they never hold up the rest of the dashboard.
- **Weather is not a ranking input yet** (FWD-003 stays out, as in spec 012).

## Discovery

| ID | Pattern | Requirement |
|----|---------|-------------|
| DSC-007 | Ubiquitous | The system shall rank next actions with captures whose season is closing first, soonest first, then tonight's other captures, most usable hours first, then stacking suggestions, most unprocessed integration first. |
| DSC-016 | Ubiquitous | The system shall state for each capture action its usable hours above 30° tonight, how close the moon comes, the days left in its season when it is closing, and the integration still short of its goals, counted per filter. |
| DSC-017 | Unwanted | If no site is set or the forward plan cannot be made, then the system shall still list the stacking suggestions, in their own order, and record the planning failure when there is one. |
| DSC-018 | Ubiquitous | The system shall show calibration, integration-goal and quality checks in a section of their own beside next actions. |
