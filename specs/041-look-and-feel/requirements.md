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
