---
version: 1
slug: "src-renderer-app-tsx"
primary_target: "src/renderer/App.tsx"
related_targets: []
---

# App shell and working screens

Scope: every renderer page (Operate mode). Audience: Leigh at his Windows PC, then other amateur astrophotographers. Job: know the next useful thing to do with their sky and their disk, then do it.

Scene: a home study at a Windows PC, mostly in the evening around observing nights with the room lights low, sometimes by day. Dark ink is the default; paper by day; red night for anyone at the scope.

## Direction contract

THESIS: The app reads like a deep-sky atlas you can work in. Position, object type and progress are drawn with the conventions astronomers already read (atlas symbols, an RA/Dec graticule, hours by filter), instead of the category default of grey cards with one blue accent.

OWN-WORLD: Prussian-ink grounds at night and cool chart-white by day, hairline graticule rules, atlas deep-sky red as the one strong accent, atlas convention colours for object kinds (galaxies red, clusters amber, nebulae green, planetaries teal). Archivo in its condensed widths for labels, tables and figures (tabular), normal width for reading. Dense, table-first, square-cornered panels with hairline borders, no shadows, no uppercase kickers.

STORY: The user sees what the sky allows tonight and what their files are ready to become, trusts it because it is drawn in their own field's notation, and acts with one primary button per page.

FIRST VIEWPORT: Left rail (logo mark, 8 places, job status at the foot). Top: page title with its one primary action at the right. Tonight: the best targets as an atlas index (symbol, name, altitude window, hours per filter bar), Next actions beneath; the sky chart and mosaic canvas sit on the graticule.

FORM: Star atlas, position 4 of the grounded list (Night band, Emission spectrum, Darkroom, Star atlas, Deep field), dealt by the roll. seed:ce5ecb24d179bee5 (degraded roll, no challengers).

SIGNATURE: every target carries its real atlas symbol (galaxy ellipse, dotted open cluster, globular circle with cross, planetary disc with rays, bright nebula square, dark nebula dashed square); the RA/Dec graticule behind sky and mosaic drawings.

Unresolved: whether to rename the app (Leigh is open to it); the logo is the atlas galaxy mark inside a graticule ring.
