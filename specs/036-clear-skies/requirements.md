# 036 Clear skies: requirements

Leigh asked (15 October 2026) for weather on Home: "a good guess as to whether tonight has clear
skies or not allowing us at a glance see the next 3 nights forecast with the keyword clear skies
visible if that is the case". The user picks the forecast or plugs in a weather service, and
Leigh's own service, [weatherlink_website](https://github.com/lgriffin/weatherlink_website), must
be one of them. This is FWD-003 (weather), which specs 012 and 013 left for an optional adapter.

## What this slice delivers

- **A Clear skies card at the top of Home** with tonight and the two nights after it. Each night
  says **Clear skies**, **Clear spells** (with the longest clear stretch), **Cloudy**, **No
  forecast yet** or **No dark window**, over the night's dark window from the ephemeris, with the
  cloud cover, the chance of rain, the clear hours and how lit the moon is.
- **One weather port, three adapters.** `WeatherSource` answers a forecast for a site. Open-Meteo
  (the default) and MET Norway are the public providers, both free and keyless; Leigh's
  weatherlink_website is the user's own service, at an address entered in Settings → Weather.
  A new provider is one adapter and one reader in the domain.
- **The user's service adds what only it knows.** weatherlink_website's `GET /api/v1/forecast`
  gives tonight's forecast from the station's own models (chance of rain in 24 hours, chance of
  frost, the overnight low) and the Met Éireann warnings in force. These are shown on the night
  they are for, and a forecast the station gives rain a 60% chance or more is not called clear.
- **Location.** The site set in Settings → Your site, the same one the planner uses.

## What was taken from aw-clock

[kshetline/aw-clock](https://github.com/kshetline/aw-clock) is a Raspberry Pi astronomy and
weather clock. Taken: a preferred weather service the user picks, with others to fall back on
(here, every chosen source is asked and one that fails is named while the rest still count);
crediting the data source on screen; the forecast a few days ahead at a glance. Not taken: its
default provider is scraped from Weather Underground and its others need keys (Weatherbit,
Visual Crossing), so this slice uses keyless providers; its planets, rise and set times and sky
map are already the Sky planner's.

## How a night is judged

- The dark window and its half-hour samples come from the ephemeris (astronomical darkness, or
  nautical on summer nights, as in spec 012).
- Each sample takes the forecast in force then. A half hour is clear at 25% cloud or less with a
  chance of precipitation below 40%.
- Clear skies: at least three quarters of the forecast dark window is clear. Clear spells: the
  longest unbroken clear stretch is two hours or more. Cloudy: anything else.
- With less than half of the dark window forecast (MET Norway's six-hourly tail, a night beyond
  the forecast), the night has no forecast yet, unless the user's service gives the night's cloud
  cover, which is then used.
- Dew is likely when any dark hour has 95% humidity or more, or a dew point within 2 °C of the air.

## Changes to the blueprint

- **Weather comes in as its own card, not as a ranking input.** Next actions still rank by the
  sky geometry alone; a cloudy tonight is shown above them, so the user sees both at once.
  Holding back tonight's captures on a cloudy forecast can follow once the verdicts have been
  checked against real nights.
- **UX-006 changes**: Home opens on the next three nights' skies, then Next actions.
- **weatherlink_website has no cloud cover yet.** Its forecast payload passes through extra
  fields, so this slice reads `evening.cloud_night` or the models' `guidance.<model>.cloud_night`
  when the service starts sending them (its `predict.py` already computes `cloud_night` for each
  model but sends only the low, high and rain).

## Out of scope

- Seeing and transparency (7Timer, Meteoblue): neither keyless provider gives them.
- The station's live readings (`/api/v1/current`) and several sites.

## The outlook

| ID | Pattern | Requirement |
|----|---------|-------------|
| WX-001 | Ubiquitous | The system shall show at the top of Home, for tonight and the two nights after it at the user's site, whether each night's dark window is forecast clear, with the words "Clear skies" when it is, the longest clear stretch when only part of it is, and its cloud cover, chance of rain, clear hours and how lit the moon is. |
| WX-002 | Ubiquitous | The system shall count a dark half hour as clear when the forecast in force then gives 25% cloud cover or less and a chance of precipitation below 40%, and shall call a night clear when at least three quarters of its forecast dark window is clear, give it clear spells when its longest clear stretch lasts two hours or more, and call it cloudy otherwise. |
| WX-007 | Unwanted | If less than half of a night's dark window is forecast, then the system shall judge the night from the cloud cover the user's weather service gives for it, or else say there is no forecast for that night yet instead of guessing. |
| WX-008 | Ubiquitous | The system shall say dew is likely on a night when any forecast dark hour gives 95% relative humidity or more, or a dew point within 2 °C of the air temperature. |
| WX-010 | Unwanted | If no site is set, or both the public forecast and the user's weather service are turned off, then the system shall say which on Home, link to the Settings section that sets it, and ask no weather source. |

## The sources

| ID | Pattern | Requirement |
|----|---------|-------------|
| WX-003 | Ubiquitous | The system shall read forecasts through one weather source port, with Open-Meteo (the default) and MET Norway as public providers the user chooses or turns off in Settings → Weather, and shall credit the sources that answered on Home. |
| WX-004 | Optional | Where the user has entered the address of their own weather service (weatherlink_website), the system shall show its forecast for tonight (chance of rain, chance of frost, the overnight low) and the weather warnings in force on the night they apply to, and shall not call a night clear when the service gives rain a 60% chance or more. |
| WX-006 | Unwanted | If a weather source cannot be reached, does not answer within 15 seconds, or answers with something that cannot be read, then the system shall name the source and why on Home and still judge the nights from the sources that answered. |
| WX-009 | Ubiquitous | The system shall ask each weather source at most once every 30 minutes for the same site, sharing one request between callers, and shall ask afresh when the site, the provider or the service's address changes, or when the last request failed. |
| WX-011 | Ubiquitous | The system shall send the public providers only the site's latitude and longitude, rounded to two decimal places (about a kilometre), and shall send the user's weather service no coordinates. |
| WX-005 | Unwanted | If the saved address of the user's weather service is not an http or https address, then the system shall not call it and shall say so with the address it read. |
