# 041 Look and feel: requirements

Leigh asked (25 October 2026) for "an impeccable ask": a UX overhaul to make astrorepo a beautiful
app to use, with light and dark mode, but above all better flow, menus and experience, chained
after the mosaic workspace (specs 037 to 040) so the new pages share the result. "Impeccable" is
the [Impeccable](https://impeccable.style) design plugin Leigh uses on other projects; it is now
pinned in `.claude/settings.json` (see `docs/design.md`).

The audit and the whole plan (slices V1 to V7: foundations, shell and navigation, Tonight,
Targets, Settings, flows, polish) are in the plan document linked from `docs/roadmap.md`. Only the
slice being built has requirements here (charter III).

## Audit (October 2026)

Taken from `npm run serve` on a fresh data folder, every page at 1440×900, 1280×720 and 800×480.

- **Places.** 18 sidebar places in 5 groups; Settings falls below the fold at 900 px; six icons
  are near-identical square glyphs. The mosaic workspace adds more.
- **Home.** A new user is asked for their site three times (Get set up, Clear skies, Coming
  nights). Every card has the same weight and a small uppercase title.
- **Targets.** All 804 catalogue objects are listed first as "Not Observed"; the selection
  checkbox sits on each name.
- **Consistency.** No shared button, field or table: 142 hand-styled buttons and 19 hand-built
  tables. Nine colour tokens as fixed hex beside 227 raw Tailwind palette classes and 38 hex
  colours, so no second theme was possible. Primary buttons drew white on the sky-blue accent at
  2.9:1, below WCAG AA.
- **Small screens.** At 800×480 (the Pi kiosk) the fixed sidebar takes 28% of the width.

## V1: foundations

- **Themes from tokens.** Every colour is a token (`bg`, `surface`, `raised`, `border`, `text`,
  `muted`, `accent`, `on-accent`, `success`, `warning`, `danger`, `info`, `scrim`, `on-scrim`,
  `cat-1` to `cat-8`) held as a CSS variable. The Tailwind names stay (`text-astro-muted`), so
  every page themes at once. Palettes are in `src/shared/themes.ts`; the rules that pick and judge
  them (`resolveTheme`, `contrastRatio`, `contrastFailures`) in `src/shared/appearance.ts`, since the
  renderer may not reach the core (HEX-002).
- **Three themes.** Dark keeps the incumbent look (with dark text on the accent, for contrast);
  light is for daylight; night is red on black for the scope, which the Pi roadmap (R3 to R5)
  also wants. The colours themselves are provisional until the Impeccable direction round.
- **Settings → Appearance**, saved as `ui_theme` (`system`, `dark`, `light`, `night`), cached on
  each screen so the first paint is already right.
- **Shared controls** in `src/renderer/components/ui`: Button, Field with Input, Select, Textarea
  and Checkbox, Table, Tabs, Badge, Stat and Skeleton. Pages move onto them slice by slice.
- **Drawn icons.** Lucide icons (ISC licence) for every place, in place of text glyphs.

## Themes

| ID | Pattern | Requirement |
|----|---------|-------------|
| LF-001 | Ubiquitous | The system shall draw every screen in one of three themes, dark, light or night, and shall follow the computer's light or dark setting, as it changes, while the user's choice is to match the computer, which is the choice until the user makes another. |
| LF-002 | Event | When the user picks a theme in Settings → Appearance, the system shall redraw the screen in it at once and keep the choice for every later start on that installation. |
| LF-003 | Unwanted | If the saved theme cannot be read or names no theme, then the system shall match the computer's setting, and if a new choice cannot be saved, then the system shall keep showing it and say that it could not be saved. |
| LF-004 | State | While the night theme is on, the system shall draw text, controls, pictures and charts only in shades of red on black. |
| LF-005 | Ubiquitous | The system shall take every colour on a screen from the theme's tokens, never a fixed colour, and every token pairing of text with what it sits on shall reach a contrast of at least 4.5:1 in every theme. |

## Shared controls and icons

| ID | Pattern | Requirement |
|----|---------|-------------|
| LF-006 | Ubiquitous | The system shall provide one shared button (primary, secondary, quiet and danger, which cannot be pressed again while busy), one labelled field whose hint and error are announced with the control, one table, one badge, one figure and one loading placeholder for every page to build with. |
| LF-007 | Event | When a row of tabs has focus and the user presses the left or right arrow, Home or End, the system shall select the previous, next, first or last tab, wrapping at the ends, and keep only the selected tab in the tab order. |
| LF-008 | Ubiquitous | The system shall mark each place in the navigation with a drawn icon in one stroke weight rather than a text character. |

## V1b: the Star atlas world

Leigh chose the **Star atlas** direction in the Impeccable round (25 October 2026): the app reads
like a deep-sky atlas you can work in. The direction contract is in
`.impeccable/surfaces/src-renderer-app-tsx.md`.

- **Palette.** Prussian-ink grounds by night, cool chart-white by day, the atlas deep-sky red as
  the accent; object kinds in the colours printed atlases use (galaxies red, reflection nebulae
  blue, planetaries teal, clusters amber, emission nebulae green). Danger moves to a rose so it
  is not the accent.
- **Type.** Archivo (SIL Open Font Licence, bundled, no network), its condensed width for labels
  and dense figures, tabular figures in every table.
- **Atlas symbols** for every kind of object, from `src/shared/atlas.ts`.
- **Headings** in sentence case at reading size; the small uppercase labels are gone.
- **The mark**: an atlas galaxy symbol inside a ring of right-ascension hour ticks.

| ID | Pattern | Requirement |
|----|---------|-------------|
| LF-009 | Ubiquitous | The system shall mark each kind of object with the symbol a deep-sky atlas uses for it (an ellipse for a galaxy, a dotted circle for an open cluster, a circle with a cross for a globular cluster, a disc with four rays for a planetary nebula, a square for a bright nebula, a dashed square for a dark nebula), in the atlas colour for that kind, with the kind's name in sentence case. |
| LF-010 | Ubiquitous | The system shall title every section in sentence case at reading size, with no small uppercase labels above or in place of a heading. |

## V2: the shell

Eighteen sidebar entries become eight places, each holding its pages as a row of links above the
page title, and a command palette reaches any page, Settings section, common action or target by
typing.

| Place | Pages |
|-------|-------|
| Home | Home |
| Targets | Targets, Collections, Messier mosaic |
| Plan | Sky planner, Projects, Mosaics |
| Process | Jobs, Stacks, Calibration |
| Data | Library, FITS files, Nights, Vespera, Storage |
| Gallery | Pictures, Posters |
| Insights | Insights |
| Settings | Settings, Equipment |

| ID | Pattern | Requirement |
|----|---------|-------------|
| LF-011 | Ubiquitous | The system shall list eight places in the sidebar, each with a drawn icon, each opening on its first page and lit while any of its pages or their detail pages is open. |
| LF-012 | State | While a page of a place with more than one page is open, the system shall show the place's pages as a row of links above the title with the open one marked, and on a detail page shall instead link back to the page it belongs to. |
| LF-013 | Event | When the user presses Ctrl+K (Cmd+K on a Mac) or chooses Go to, the system shall open a palette that lists every page, Settings section and common action, narrows as the user types to entries with a word starting with each typed word, adds targets by name once two letters are typed, and opens the highlighted entry on Enter, moving with the arrow keys and closing on Escape with focus back where it was. |
| LF-014 | Event | When the user folds the sidebar, the system shall show only the places' icons, each still named for screen readers and on hover, and remember the choice on that screen. |
| LF-015 | Unwanted | If the palette finds nothing for what was typed, then the system shall say that nothing matches rather than show an empty list. |

## V3: Home leads with tonight

Home opens on one panel that answers "is it worth setting up tonight?": the forecast's verdict for
tonight, the dark window, the moon drawn as it is lit, and the three best targets. Next actions
become two lists side by side, **Shoot tonight** and **Ready to process**, so a capture never hides
behind a long stacking list. The Coming nights card keeps closing seasons and the new-moon window.

| ID | Pattern | Requirement |
|----|---------|-------------|
| LF-016 | Ubiquitous | The system shall open Home on a Tonight panel that says whether tonight looks clear, when it is dark and how dark (once the plan has said; the forecast alone gives only the night), how lit the moon is (drawn and in words), any note on the darkness or the moon, and the three best targets to shoot, each linking to its page. |
| LF-017 | Ubiquitous | The system shall list tonight's captures under Shoot tonight and stacking under Ready to process, side by side, and mosaic tiles waiting for a coming night under Plan ahead, each suggestion's priority shown as a coloured mark that is also named in words for screen readers. |
| LF-018 | Unwanted | If tonight is forecast cloudy or has no dark window, then the system shall list no targets to shoot on the Tonight panel and say why. |
| LF-019 | State | While the site is not set, the system shall show the Tonight panel as a link to Settings > Your site instead of a night it cannot work out. |

## V4: your targets first

The catalogue holds thousands of objects, and the Targets page used to open on all of them in name
order. It now opens on **Yours**: the targets that something of the user's points at (a file, a
library folder, a night, a stage past "not observed", one added by hand, or a collection they made).
**Whole catalogue** is one tab away. Choosing targets for a batch change is a mode with real
checkboxes beside the cards rather than a box drawn over each card's title.

| ID | Pattern | Requirement |
|----|---------|-------------|
| LF-020 | Ubiquitous | The system shall open Targets on Yours, listing only the targets that an indexed file, a library folder, a logged night, a stage past not observed, a hand entry or a collection the user made points at, with the whole catalogue on a second tab, and filters, sort and search applying to either. |
| LF-021 | Unwanted | If none of the user's targets match a search, then the system shall offer to search the whole catalogue, and if the user has no targets at all, offer to scan the library or browse the catalogue. |
| LF-022 | Event | When the user chooses to pick targets, the system shall show a labelled checkbox beside each card, named after its target and reachable by keyboard, without covering the card, and leave cards as plain links otherwise. |
| LF-023 | State | While targets are chosen, the system shall show what can be done with them in a bar at the bottom of the page built from the shared controls, and ask before deleting them. |
