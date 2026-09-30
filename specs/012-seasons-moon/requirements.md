# 012 Seasons, moon and tonight: requirements

Slice L of the cockpit blueprint. From the site in Settings, the app looks ahead: what is worth
shooting tonight given the moon, which targets are about to leave the sky for the year, when the
next dark (new-moon) nights are and what to shoot in them, and how each target's season runs over
the next 12 months.

## What this slice delivers

- A **Coming nights** card on the dashboard: tonight's dark window and moon, the targets with
  work left that are up for at least an hour, targets whose season is closing, and the next
  new-moon window with the best targets for it.
- A **Seasons** table and **New-moon windows** list on the Sky Planner page.
- A **dual-band or narrowband filter** setting (on by default, since the Seestar S50's
  light-pollution filter is dual-band). While the moon is bright, only emission targets are
  suggested, and only with that filter.

"Work left" means below the target's integration goal or, with no goal set, started but with no
finished image yet. Targets need coordinates (catalogue targets have them).

## Changes to the blueprint

- **One site, from the existing settings.** The blueprint's multi-site model waits for slice D
  (sky geometry); the Sky Planner's latitude, longitude and elevation are the site.
- **Dark means astronomical twilight**, with nautical as the fallback on summer nights at high
  latitude (FWD-008, new), because at 50°N and above the sun never gets 18° down in June.
- **FWD-003 (weather) is not in this slice.** It needs an outside forecast service, which the
  charter keeps optional; it can follow as an adapter.
- **Seasons are sampled**, weekly for the 12-month view and nightly for the next 35 nights for
  closing warnings; each night is computed once and shared by every target (NFR-009, new).
- **Nights are site nights.** A night is the date its evening began at the site; tonight moves to
  the coming evening once the night's darkness has ended, and new moons are dated by the night they
  fall in, so a new moon after midnight belongs to the evening before.
- **No site is a state, not an error** (FWD-007, new): the card says what to set and links there.

## Forward planning

| ID | Pattern | Requirement |
|----|---------|-------------|
| FWD-001 | Ubiquitous | The system shall show, for each target with coordinates and work left, the average dark hours per night it spends above 30° from the user's site in each of the next 12 months, marking its best month and the months with a new moon. |
| FWD-002 | Complex | While a target with work left offers at least an hour above 30° tonight, when a night in the next 30 days offers less, the system shall warn that its season is closing, with that date and the days left. |
| FWD-004 | Ubiquitous | The system shall list each new moon in the next 90 days with its dark window of three nights either side and the three targets with work left that offer the most hours above 30° on the new-moon night. |
| FWD-005 | State | While the moon is above the horizon and more than 60% lit during tonight's dark window, the system shall suggest only emission targets, and only when the user has a dual-band or narrowband filter, saying which applies; the moon's phase is shown whether or not it rises. |
| FWD-006 | Ubiquitous | The system shall list tonight's targets with work left that spend at least an hour above 30° in the dark window, most hours first, with the closest the moon comes to each. |
| FWD-007 | Unwanted | If the observing site is not set or not valid, then the system shall say what to set and link to Settings instead of showing a plan. |
| FWD-008 | Unwanted | If the sun does not get 18° below the horizon on a night, then the system shall plan that night with nautical darkness and say so, treat a night where it does not get 12° below as having no dark window, and treat a day where it stays below the threshold throughout as dark from noon to noon. |

## Non-functional

| ID | Pattern | Requirement |
|----|---------|-------------|
| NFR-009 | Ubiquitous | The system shall compute the sky for each planned night once per plan, however many targets it covers. |
