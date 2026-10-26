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
