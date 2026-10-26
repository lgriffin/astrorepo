# Planning ahead: seasons, the moon and tonight

The app looks ahead from your site for the targets that still need data. It shows up in three
places: the **Clear skies** and **Coming nights** cards on Home, and the **Seasons** table and
**New-moon windows** list at the bottom of the Sky planner.

## Before you start

Set your latitude and longitude (and elevation, if you like) in **Settings → Your site**. It is
the only place the site is set: the Sky planner, the Coming nights card and Home's **Get set up**
checklist all link there until it is.

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

The same captures also lead Home's **Shoot tonight** list, ranked with closing seasons
first (see [Using the cockpit](cockpit.md#next-actions)).

## Clear skies

The first card on Home looks at tonight and the next two nights and says, for each, whether its
dark window is forecast clear. Look for **Clear skies**.

- **Clear skies**: at least three quarters of the dark window is clear. A half hour counts as
  clear at 25% cloud or less, with a chance of rain below 40%.
- **Clear spells**: not that clear, but with an unbroken clear stretch of two hours or more. The
  card gives its times.
- **Cloudy**: neither.
- **No forecast yet**: less than half of the dark window is forecast (MET Norway turns six-hourly
  after about two and a half days), so the card does not guess.
- **No dark window**: the sun does not get 12° down that night.

Each night also shows its dark window, the average cloud cover, the highest chance of rain, the
clear hours and how lit the moon is, and says when dew is likely (95% humidity, or the dew point
within 2 °C of the air) so the dew heater goes on.

### Where the forecast comes from

Choose in **Settings → Weather**:

- **Forecast**: [Open-Meteo](https://open-meteo.com) (the default) or
  [MET Norway](https://api.met.no), both free with no key, or **None**. Only your site's latitude
  and longitude, rounded to two decimal places (about a kilometre), are sent.
- **Your weather service**: the address of your
  [weatherlink_website](https://github.com/lgriffin/weatherlink_website) server, such as
  `http://nas.local:1456`. Its `/api/v1/forecast` gives tonight's chance of rain and frost, the
  overnight low and the Met Éireann warnings in force; they appear on tonight's tile, and a night
  your station gives rain a 60% chance or more is never called clear. If you turn the public
  forecast off, tonight is judged from the service's own cloud cover when it sends one
  (`evening.cloud_night`, or each model's `guidance.<model>.cloud_night`).

**Save and check** in Settings saves what the form holds, then asks every source afresh (not the
answers kept for Home) and says which answered. A source
that cannot be reached, answers with an error or takes more than 15 seconds is named on Home
with the reason, and the other one still counts. Answers are kept for 30 minutes, so opening Home
again does not ask twice; changing the site, the forecast or the address asks afresh.

## Seasons table

One row per target, one column per month for the next 12 months. Each cell is the average usable
hours a night that month, sampled weekly; darker cells mean longer nights. Each target's best month
is outlined. Hover a month header to see whether it has a new moon; the current month counts a new moon
earlier in the month too.

## Limits for now

- One site. Several sites come with the sky geometry slice.
- Weather is shown beside the plan, not used to rank it: a cloudy tonight does not yet move tonight's captures down Shoot tonight.
- Positions are J2000 and refraction is ignored; both matter far less than the 30° cut-off.
