# Planning ahead: seasons, the moon and tonight

The app looks ahead from your site for the targets that still need data. It shows up in two
places: the **Coming nights** card on the dashboard, and the **Seasons** table and **New-moon
windows** list at the bottom of the Sky Planner.

## Before you start

Set your latitude and longitude (and elevation, if you like) in **Settings → Observer Location**
or on the Sky Planner. Until then, the card says what to set and links there.

Tick **I have a dual-band or narrowband filter** if you do. It is on by default, because the
Seestar S50's built-in light-pollution filter is dual-band.

## Which targets are planned

Targets with coordinates (every catalogue target has them) and **work left**:

- below their integration goal, when you have set one; or
- with subs but no finished image (JPEG or PNG) yet, when you have not.

Subs rejected by quality checks do not count toward a goal.

## What the numbers mean

- **Dark** means from astronomical dusk to dawn, when the sun is 18° below the horizon. On summer
  nights at high latitudes (the UK in June, for example) the sun never gets that low, so the plan
  uses nautical darkness (12°) and says so. If the sun does not even get 12° down, the night has no
  dark window. In polar night, when the sun stays below 18° all day, the whole day from noon to noon
  counts as dark.
- **Usable hours** are the dark hours a target spends above 30°, checked every half hour and cut
  off exactly at dawn.
- **Tonight** is the night in progress until its darkness ends; after dawn, it is the coming
  evening, so a morning look at the card shows the night ahead, not the one just gone.
- **Dates of new moons** are the evening of the night they fall in at your site, so a new moon at
  1 am counts for the evening before.
- To **clear your site**, empty the latitude and longitude in Settings and save.

## Coming nights card

- **Tonight**: the dark window, how lit the moon is (and whether it stays below the horizon all
  night), and your targets that are up for at least an
  hour, most hours first, with how close the moon comes to each.
- **Bright moon**: above 60% lit and above the horizon, only emission targets (emission and
  planetary nebulae, supernova remnants) are suggested, because a dual-band or narrowband filter
  cuts most moonlight from them. Without that filter, nothing is suggested and the card says why.
- **Season closing**: targets that are up for an hour tonight but will not be within the next 30
  days, with the date and days left. Shoot these first.
- **Next new moon**: the dark window three nights either side of it, and the three targets that
  are up longest on the new-moon night.

The same captures also lead the dashboard's **Next actions** list, ranked with closing seasons
first (see [Using the cockpit](cockpit.md#next-actions)).

## Seasons table

One row per target, one column per month for the next 12 months. Each cell is the average usable
hours a night that month, sampled weekly; darker cells mean longer nights. Each target's best month
is outlined. Hover a month header to see whether it has a new moon; the current month counts a new moon
earlier in the month too.

## Limits for now

- One site. Several sites come with the sky geometry slice.
- No weather. A forecast service could be added later as an optional adapter.
- Positions are J2000 and refraction is ignored; both matter far less than the 30° cut-off.
