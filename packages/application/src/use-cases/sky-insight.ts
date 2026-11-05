import { nightsFrom, readSkyQuality, skyInsight, type NightOutlook, type SkyInsight } from '@astro/domain'
import type { Clock } from '../ports/clock'
import type { Ephemeris, PlanningSettings, SkyQualitySettings } from '../ports/sky'
import type { ClearSkies } from './clear-skies'
import { tonightAt } from './plan-forward'

export interface SkyInsightDeps {
  planning: PlanningSettings
  quality: SkyQualitySettings
  ephemeris: Ephemeris
  clock: Clock
  /** The next nights' skies (spec 036), whose answers the composition root keeps for half an hour. */
  clearSkies: ClearSkies
}

export type SkyInsightAnswer = { status: 'no-site' } | { status: 'ok'; insight: SkyInsight }

export type DescribeSkyInsight = () => Promise<SkyInsightAnswer>

/**
 * Tonight's sky at a glance on Home (specs/043-sky-insight, NSI-001 to NSI-008): tonight's and last
 * night's dark windows from the ephemeris, tonight's forecast from the clear-skies outlook, and the
 * user's sky quality. A forecast that fails leaves the rest of the insight standing (NSI-008).
 */
export function makeDescribeSkyInsight(deps: SkyInsightDeps): DescribeSkyInsight {
  return async () => {
    const site = await deps.planning.site()
    if (!site) return { status: 'no-site' }
    const cache = new Map<string, Promise<Awaited<ReturnType<Ephemeris['nightSky']>>>>()
    const skyOn = (night: string) => {
      let sky = cache.get(night)
      if (!sky) {
        sky = deps.ephemeris.nightSky(site, night)
        cache.set(night, sky)
      }
      return sky
    }
    const night = await tonightAt(deps.clock.now(), site, skyOn)
    const lastNight = nightsFrom(night, 2, -1)[1]
    const [sky, previous, saved, outlook] = await Promise.all([
      skyOn(night),
      skyOn(lastNight),
      deps.quality.skyQuality(),
      deps.clearSkies().then(
        (o): NightOutlook | 'off' | 'unavailable' =>
          o.status === 'off'
            ? 'off'
            : // Every source failing is no forecast at all, not a night the forecast has not reached yet.
              o.status === 'ok' && o.sources.some(s => s.problem === null)
              ? (o.nights.find(n => n.night === night) ?? 'unavailable')
              : 'unavailable',
        (): 'unavailable' => 'unavailable'
      )
    ])
    return { status: 'ok', insight: skyInsight({ night, sky, previous, outlook, quality: readSkyQuality(saved) }) }
  }
}
