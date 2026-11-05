# 043 Sky insight: requirements

Leigh asked (5 November 2026) for a Home screen insight like Ryan Clinton's
[Meanwhile, in space](https://ryanclinton.uk/astrophotography/meanwhile): "it shows moon
luminosity and our bortle from our location as well as potential coverage of clouds and dark
duration. Lets add it".

## What this slice delivers

- **A Tonight's sky card on Home**, straight under Tonight, with four tiles and one sentence:
  - **Darkness**: how long it is properly dark tonight, from when to when, and how that compares
    with last night.
  - **Moon**: how lit it is, its phase (waxing or waning), how much of the dark it is up for and
    when, and the dark hours left without it.
  - **Cloud**: tonight's verdict from spec 036's forecast (clear, clear spells, cloudy), the mean
    cloud cover over the dark, the clear hours, and dew; or why there is no forecast.
  - **Your sky**: the site's Bortle class and name, from a Sky Quality Meter reading or the class
    the user picked, on a nine-step scale.
  - **In short**: one sentence on how tonight suits faint galaxies and nebulae, and why: good,
    possible, poor, or no proper dark. Meanwhile rates activities the same way.
- **Your sky in Settings → Your site**: a Bortle class (1 to 9) and an optional Sky Quality Meter
  reading in mag/arcsec². A reading wins, since it is measured.

## Why Bortle is entered, not looked up

Meanwhile reads a light-pollution atlas and says it is "a model, not tonight's measurement". The
atlases (Falchi et al. 2016, the World Atlas of Artificial Night Sky Brightness; VIIRS-based maps
such as lightpollutionmap.info) are gigabytes of raster or an online service. astrorepo is offline
first and sends services no more than it must (WX-011), so the user enters their class or meter
reading once, with a pointer to a map to look it up. A bundled coarse atlas or a lookup service can
be added behind the same SkyQualitySettings port later.

## Reused

- The dark window and moon samples come from the Ephemeris port (spec 012): astronomical darkness,
  or nautical on summer nights.
- The cloud comes from spec 036's `ClearSkies` outlook for the same night, including the answers it
  keeps for half an hour, so the card asks no weather source of its own.
- The site is Settings → Your site, the same one the planner and the forecast use.

## Out of scope

- Seeing and transparency (Meanwhile uses 7Timer): a follow-up.
- An hour-by-hour cloud strip and "N of 4 centres agree": spec 036 merges one provider and the
  user's service, not several models.
- Using the faint-target rating to rank Next actions.

## The card

| ID | Pattern | Requirement |
|----|---------|-------------|
| NSI-001 | Ubiquitous | The system shall show on Home, under Tonight, how long tonight's dark window lasts at the user's site, from when to when, whether it is astronomical or only nautical, and how many minutes longer or shorter it is than last night's. |
| NSI-002 | Ubiquitous | The system shall show how much of the Moon's disc is lit tonight, its phase named as waxing or waning by comparison with last night, the hours of the dark window it is above the horizon and from when to when, and the dark hours left with the Moon down. |
| NSI-005 | Ubiquitous | The system shall show tonight's cloud from the clear-skies outlook of spec 036 for the same night: its verdict, the mean cloud cover over the dark window, the clear hours of the dark, and whether dew is likely, without asking any weather source again. |
| NSI-006 | Ubiquitous | The system shall rate tonight for faint targets as no proper dark when there is no dark window; poor when the night is forecast cloudy or leaves less than one dark hour with the Moon down; good when it is astronomically dark, forecast clear, leaves three or more dark hours with the Moon down, and the sky is darker than Bortle 7; and possible otherwise. |
| NSI-007 | Ubiquitous | The system shall sum the night up in one sentence that names the rating and the figures behind it: the dark hours without the Moon, the clear spell, the nautical sky or the bright Bortle class that held it back. |
| NSI-008 | Unwanted | If the forecast is turned off or cannot be read, then the system shall still show the darkness, the Moon and the user's sky, say which in the cloud tile, and rate the night without the cloud. |
| NSI-009 | Unwanted | If no site is set, then the system shall say so in place of the card and link to Settings → Your site. |

## Your sky

| ID | Pattern | Requirement |
|----|---------|-------------|
| NSI-003 | Ubiquitous | The system shall let the user set their sky's Bortle class from 1 to 9 in Settings → Your site, name each class as Wikipedia's Bortle scale does, and show the class and its name on the card, or a link to set it when it is not set. |
| NSI-004 | Optional | Where the user has entered a Sky Quality Meter reading between 16 and 22.5 mag/arcsec², the system shall show the reading and work the Bortle class out from it by the scale's zenith brightness ranges, in place of the class they picked, calling a reading below 18.38 class 8. |
