# 046 Everyday UX: requirements

Leigh asked (7 November 2026): "Can you do both a DX and a UX overhaul for the system." The
look-and-feel overhaul (spec 041) gave the app its Star atlas look and eight places. This round
makes each screen say a thing once, ask for each setting once and show only numbers from your own
data, and lets every part of it be worked from the keyboard. The plan splits it into slices U1 to
U6; this spec holds the IDs of the slices built so far.

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

## U4: keyboard and accessibility

The smoke run (spec 045, D3) left 5 serious accessibility findings over an empty data folder and
15 over the demo library (D4): list boxes and a date field without a name, a link inside a toggle
button, links in sentences told apart by colour alone, hints and tile names dimmed below 4.5:1,
and, in the night theme, muted text on a selected row at 4.1:1. Reading the code found 13 rows,
cards and days that opened something on a click but could not be reached with Tab.

- **Everything that opens on a click opens from the keyboard.** A row, card or calendar day that
  acts on a click takes focus, and Enter or Space on it does the same (`pressable`). A toggle and
  the link to a target sit side by side rather than one inside the other. Sortable columns are
  buttons that say how the list is sorted. The picture viewer's click beside the picture stays a
  mouse convenience: Escape does the same.
- **Keyboard shortcuts.** **?** (outside a text field) or **Shortcuts** in the sidebar lists every
  key the app answers. Escape closes it and puts focus back.
- **Legible on tints.** Text on a selected row (the accent at up to 10%) and a badge on a card (its
  own colour at up to 20%) reach 4.5:1 in every theme; the palettes moved slightly to get there
  (dark accent and danger a little lighter, light accent and warning a little darker, night muted
  a little brighter). Text in the text and muted colours is never dimmed with an opacity. A link
  inside a sentence is underlined.
- **Every list box has a name.** Its own label or the label it sits in.
- **No findings left.** Both smoke baselines are empty, so any serious or critical finding fails
  the run.

## U5: sample data on first run

Someone who has just installed the app sees empty pages until they have chosen a folder and
scanned it, so they cannot tell what the app will do for them. The demo library (spec 045, D4)
already shows every page with something in it, but only to a developer.

- **Try it with sample data.** On the desktop app, while no home folder is chosen, Get set up
  offers the sample beside its steps. The app builds the demo library in a folder of its own inside
  its data folder, restarts on a database of the sample's own, and indexes it there: six made-up
  targets at different points of the workflow, with a site, scans and three logged nights.
- **Clearly the sample.** A band across the top of every page says it is sample data, nothing in
  it is yours, and leaving removes it.
- **One click back.** **Use my own data** restarts the app on the person's own database, which the
  sample never opened, and then removes the sample's folder. Only a folder holding the sample's
  marker is removed; a folder of that name the app did not make is never built over or removed.
- **Desktop only.** A browser or companion screen of the headless server is never offered the
  sample, and the server has no channel that builds one or restarts anything.

## U6: quicker pages

Since D6 every page but Home loads the first time it is opened, so the app starts on half the
script. That moved the wait to the first visit of each place, which showed the loading line.

- **Fetched before the click.** Pointing at a place in the sidebar, reaching it with Tab, or
  highlighting it in Go to starts loading its page, once.
- **Fetched while you look at Home.** Two seconds after the app starts, when the browser is idle,
  the first page of each sidebar place is fetched in the background, so a first visit opens at
  once (75 ms to Targets in a served run, against a loading line before). A companion screen,
  which reaches the PC over the network, fetches nothing ahead.
- **The same loading line otherwise.** A page opened from a link elsewhere still shows the loading
  line while it comes, and a page that cannot be loaded says so with **Reload** (DEV-023).

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
| EUX-010 | Ubiquitous | Every element that acts on a click shall take keyboard focus and act on Enter and Space, and no control shall sit inside another, except a mouse convenience whose key is listed. |
| EUX-011 | Event | When ? is pressed outside a text field, or Shortcuts is chosen in the sidebar, the system shall list every keyboard shortcut it answers, and Escape shall close the list and return focus. |
| EUX-012 | Ubiquitous | Text on a selected row, a badge on a card, and text in the text and muted colours shall reach 4.5:1 in every theme, and a link inside a sentence shall be underlined. |
| EUX-013 | Ubiquitous | Every list box shall have an accessible name, and the smoke run shall accept no serious or critical accessibility finding on any page in any theme, with or without the demo library. |
| EUX-014 | Event | When Try it with sample data is chosen, the system shall build the demo library in a sample folder of its own, restart on a database of the sample's own, and index the library there once, with its site, scans and logged nights. |
| EUX-015 | State | While the sample is on, every page shall show that it is sample data, that nothing in it is yours, and a way to use your own data. |
| EUX-016 | Unwanted | If the sample is left, or a folder where the sample goes was not made by the app, then the system shall restart on your own database and remove only a folder holding the sample's marker, and shall not build over or remove any other folder. |
| EUX-017 | Optional | Where the app runs on the desktop and no home folder is chosen, Get set up shall offer the sample; a browser, a companion screen or the headless server shall not offer or build it. |
| EUX-018 | Event | When a place is pointed at or reached with Tab in the sidebar, or highlighted in Go to, the system shall start loading its page, once. |
| EUX-019 | State | While Home is idle after the app starts, the system shall load the first page of each sidebar place in the background, except on a companion screen. |
