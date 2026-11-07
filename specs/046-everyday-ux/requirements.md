# 046 Everyday UX: requirements

Leigh asked (7 November 2026): "Can you do both a DX and a UX overhaul for the system." The
look-and-feel overhaul (spec 041) gave the app its Star atlas look and eight places. This round
makes each screen say a thing once, ask for each setting once and show only numbers from your own
data. The plan splits it into slices U1 to U6; this spec holds the IDs of the slices built so far.

An audit on 7 November 2026 of Home on a new data folder found "set your site" four times: in Get
set up, in Tonight, in Tonight's sky and in Clear skies, with Coming nights and Shoot tonight empty
for the same reason. Setting the site meant opening Settings and typing latitude and longitude
into two fields.

## U1: a calm first run

- **Asked once.** Until the site is set, Home leaves out Tonight, Tonight's sky, Shoot tonight,
  Clear skies and Coming nights. Get set up asks for the site, with a field to set it right there.
  When the checklist is hidden, one Tonight prompt with the same field stands in for those cards.
- **Paste, don't type.** The field takes coordinates as a map gives them: `53.35, -6.26`, a map
  link with `@53.35,-6.26`, hemisphere letters, or degrees, minutes and seconds. Settings → Your
  site has the same Paste coordinates field above latitude and longitude.

## U2: one Tonight

The audit found Tonight and Tonight's sky side by side, each with the dark window and the Moon;
with no forecast, "no forecast" four times (Tonight's note, the Cloud tile and each Clear skies
night); and every Shoot tonight row with the same Open target button.

- **One card.** Tonight's sky is drawn inside Tonight: the faint-target rating and sentence under
  the headline, then Dark, Moon, Cloud and Your sky once each, and the noon-to-noon strip.
- **A missing forecast said once.** Tonight's Cloud says why there is none (off, unreadable with
  the service and its problem, or not reaching tonight yet). Clear skies is left out when it
  would only say it again.
- **Rows open their target.** A row's title is the link to its target; a button is kept only for
  an action that goes elsewhere.

## U3: honest numbers

The audit found Insights calling all 804 catalogue targets "Planned" before you had any data,
counting them by type, giving nights twice (Nights from logged nights, Sessions from the same
log) beside a separate total exposure, and drawing an empty library's zeros in the accent colour.

- **Only your targets.** Insights' totals and targets by type count a target once it is yours:
  added by hand, moved past "not observed", given a folder, found in your files, logged on a
  night or put in a collection you made (the same rule as Targets → Yours). Catalogue progress
  still shows each catalogue's size.
- **Nights, once.** A night is counted once whether you logged it, imaged it, or both: logged
  dates and the nights of your light frames (noon to noon, so frames after midnight join the
  evening before; calibration frames do not count) together. Insights shows it once, as Nights, beside
  imaging hours from your files; Log a night saves a night. Lists of session folders are named so.
- **Quiet zeros.** A tile whose value is zero (0, 0.0, 0s) is drawn muted, never in the accent.

## Out of scope

- Looking a place up by name: it would need a gazetteer or an online service.

## Requirements

| ID | Pattern | Requirement |
|----|---------|-------------|
| EUX-001 | State | While no site is set, Home shall ask for it in one place, Get set up or else one Tonight prompt, with a field to set it there that saves latitude and longitude together, and leave out Tonight, Tonight's sky, Shoot tonight, Clear skies and Coming nights. |
| EUX-002 | Event | When coordinates are pasted as a pair, a map link, with hemisphere letters, or in degrees, minutes and seconds, the system shall fill latitude and longitude from them, south and west negative. |
| EUX-003 | Unwanted | If pasted coordinates cannot be read whole (a stray sign or mark, or a sign that disagrees with its hemisphere letter) or lie outside -90 to 90 and -180 to 180, then the system shall say what it expects and change neither latitude nor longitude. |
| EUX-004 | Ubiquitous | Home shall show tonight's dark window, Moon, cloud and sky class once each, in one Tonight card with the faint-target rating and the noon-to-noon strip. |
| EUX-005 | Unwanted | If tonight has no forecast, then Home shall say so once, in Tonight, with the reason and where to fix it, and leave out Clear skies when it has no night forecast to add. |
| EUX-006 | Ubiquitous | Each row of Home's lists shall open its target from its title, and shall show a button only for an action that goes somewhere other than that target. |
| EUX-007 | Ubiquitous | Insights shall count, in its target totals and targets by type, only the targets that are yours, never catalogue entries you have not added, planned, imaged or collected. |
| EUX-008 | Ubiquitous | The system shall count each night once, from the nights you logged and the nights of your light frames together, and Insights shall show it once, as Nights. |
| EUX-009 | Ubiquitous | A total that is zero shall be drawn muted, never in the accent colour. |
