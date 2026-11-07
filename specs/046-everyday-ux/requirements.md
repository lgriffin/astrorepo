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

## Out of scope

- Looking a place up by name: it would need a gazetteer or an online service.
- Merging Tonight and Tonight's sky (slice U2).

## Requirements

| ID | Pattern | Requirement |
|----|---------|-------------|
| EUX-001 | State | While no site is set, Home shall ask for it in one place, Get set up or else one Tonight prompt, with a field to set it there that saves latitude and longitude together, and leave out Tonight, Tonight's sky, Shoot tonight, Clear skies and Coming nights. |
| EUX-002 | Event | When coordinates are pasted as a pair, a map link, with hemisphere letters, or in degrees, minutes and seconds, the system shall fill latitude and longitude from them, south and west negative. |
| EUX-003 | Unwanted | If pasted coordinates cannot be read whole (a stray sign or mark, or a sign that disagrees with its hemisphere letter) or lie outside -90 to 90 and -180 to 180, then the system shall say what it expects and change neither latitude nor longitude. |
