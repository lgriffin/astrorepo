# Design

The renderer is designed with [Impeccable](https://impeccable.style), a Claude Code plugin
(Apache 2.0) by Paul Bakaus that gives the agent a design vocabulary and flags generic UI patterns.
Leigh uses it on his other projects; the look-and-feel overhaul (spec 041) brought it here.

## Setup

`.claude/settings.json` registers the `pbakaus/impeccable` marketplace, pinned to a release tag, and
enables the `impeccable` plugin. Claude Code asks to install it the first time you trust this
folder. To move to a newer release, change `ref` to the new `skill-v…` tag in a pull request; the
plugin's hooks run a bundled detector on every UI edit, so read the release notes first.

A cloud session that cannot install plugins can still follow it: clone
`https://github.com/pbakaus/impeccable` at the pinned tag and run
`plugin/skills/impeccable/scripts/impeccable context` from the repository root.

`PRODUCT.md` at the root is the product record Impeccable reads (who the app is for, what it does,
what must not be invented). Update it when that changes, not for visual decisions.

## Everyday commands

- `/impeccable critique` or `/impeccable audit` on a page before a UI pull request
- `/impeccable polish`, `typeset`, `layout`, `colorize` to refine a view
- `/impeccable shape` to plan a new page before building it

## Themes and colour

- Every colour is a token: `bg`, `surface`, `raised`, `border`, `text`, `muted`, `accent`,
  `on-accent` (text on a filled accent, danger or success button), `success`, `warning`, `danger`,
  `info`, `scrim` and `on-scrim` (overlays on pictures), and `cat-1` to `cat-8` for categories and
  chart series. Use them as Tailwind classes (`text-astro-muted`, `bg-astro-accent/10`), or
  `tokenColor('cat-2')` from `src/renderer/theme.ts` for SVG and inline styles.
- Palettes for dark, light and night are in `src/shared/themes.ts`. A test fails on any fixed
  colour in the renderer (hex, `rgb()`, or a Tailwind palette class such as `text-red-400`) and on
  any token pair below 4.5:1 contrast.
- Night is red only. Pictures are tinted red by `global.css`; status must be told in words, since
  every status colour is a shade of red.
- The choice is the `ui_theme` setting (`system`, `dark`, `light`, `night`), picked in
  Settings → Appearance and cached per screen so the first paint is right.

## Shared controls

`src/renderer/components/ui` holds Button (primary, secondary, ghost, danger; `busy` stops a second
press), Field with Input, Select, Textarea and Checkbox (label, hint and error wired for screen
readers), Table with Th, Td and Tr, Tabs (arrow keys, Home and End), Badge, Stat and Skeleton. New
pages build with these; older pages move onto them slice by slice. Place icons are Lucide
(`components/common/nav-icons.tsx`): add one there for every new place in the navigation map.

## Loading, messages and empty lists

- **Loading.** Use `<Loading label="Loading the targets" />` from `components/ui`: placeholder lines
  with `role="status"`, named for what is coming. A test fails on bare "Loading..." text.
- **Messages.** `useToast().addToast(text, kind)` with kind `success`, `info` or `error`. Each shows
  its icon and, for screen readers, its kind in words. Successes and notes go after `TOAST_MS`
  (5 s); a problem stays until it is dismissed.
- **Empty lists.** Use `EmptyState` from `components/common/Card` and offer the way to fill the
  list: a form on the spot (Collections makes a collection) or a link to the page that fills it,
  so an empty page always leads somewhere. Loading text such as "Reading the pixels…" is a
  `Loading` label, never a plain line; the flows test catches both.

## App icon

The icon is the sidebar mark on a rounded tile, built from the shared geometry in
`src/shared/logo.ts`. The favicon is drawn from the open theme each time it changes. For the
desktop app, `npx tsx scripts/app-icon.ts` writes `resources/icon.svg` in the dark palette and
wraps `resources/icon.png` (256×256, drawn from that SVG in any browser) as `resources/icon.ico`.
When the mark changes, the script deletes the stale PNG and ICO and stops until the PNG is
redrawn. A test fails when the committed SVG no longer matches the mark or the ICO does not hold
the committed PNG.

## Small screens

Below 1024 px wide (the 800×480 Pi kiosk) the sidebar starts as a rail of icons until it is
opened on that screen, which is then remembered. Page headers wrap their actions under the title.

## The Star atlas world

Leigh chose the **Star atlas** direction (25 October 2026): the app reads like a deep-sky atlas
you can work in. The contract is in `.impeccable/surfaces/src-renderer-app-tsx.md`; `DESIGN.md`
is written from the built world when the overhaul's last slice (V7) lands.

- **Palette.** Dark is Prussian ink (`bg` #0b1822) with the atlas deep-sky red as the accent;
  light is cool chart-white with the red printed darker. `danger` is a rose, not the accent red,
  and always comes with words.
- **Type.** Archivo, bundled from `@fontsource-variable/archivo` (no network). `font-condensed`
  gives its narrow width for labels, table headings and dense figures; tables use tabular figures.
- **Atlas symbols.** `AtlasSymbol` and `AtlasKind` (`components/atlas/AtlasSymbol.tsx`) draw each
  kind of object as an atlas does, from `src/shared/atlas.ts`: galaxies an ellipse in red, open
  clusters a dotted circle and globulars a crossed circle in amber, planetaries a rayed disc in
  teal, bright nebulae a square in green (reflection in blue), dark nebulae a dashed square.
  Show a target's kind with `AtlasKind`, never a coloured pill.
- **Headings** are sentence case at reading size (`text-base font-semibold`); no small uppercase
  labels (a test fails on `uppercase` in the renderer).
- **Corners** are near-square (Tailwind's `rounded-lg` is 4px here); no shadows on panels; no
  coloured side stripes.
- **The mark** (`components/atlas/Logo.tsx`): the galaxy symbol in red inside a ring of 24
  right-ascension hour ticks, with the celestial equator across it.
