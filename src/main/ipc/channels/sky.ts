import { getSqlite } from '../../db/connection'
import { clock, composeCore } from '../../composition'
import { toForwardPlanView } from '../../adapters/planning-presenter'
import { toClearSkiesView } from '../../adapters/weather-presenter'
import { toSkyInsightView } from '../../adapters/sky-insight-presenter'
import { toMosaicPlanView, toSolveQueuedView, toTargetGeometryView } from '../../adapters/sky-geometry-presenter'
import { toIntegrationView, toMosaicIntegrationView } from '../../adapters/forecast-presenter'
import { toFilterLightView, toFitsLearningView, toLearningLibraryView, toLookbackStopView, toObjectNumbersView, toTonightSkyView } from '../../adapters/learning-presenter'
import { explainHeaders, filtersLight, lookbackStrip, sourceUrl, tonightSky } from '@astro/domain'
import { FORECAST_MINUTES } from '@astro/application'
import { kickJobs } from '../../jobs-host'
import { getTargetAltitudeCurve, getBestTargetsTonight, getMoonInfo, getTwilightTimes, getTargetVisibility } from '../../services/sky-planner'
import type { Desktop } from '../../transport/desktop'
import { validated, type Handle } from './validated'
import { sky, mosaicOptions, CSV } from './shared'

/** The sky planner, forecasts, mosaics and learning. */
export function registerSkyChannels(handle: Handle, desktop: Desktop): void {
  handle('sky:altitude-curve', validated('sky:altitude-curve', (args) => {
    return { points: getTargetAltitudeCurve(args.target_id, args.date, args.lat, args.lon, args.elevation) }
  }))

  handle('sky:best-tonight', validated('sky:best-tonight', (args) => {
    return { targets: getBestTargetsTonight(args.lat, args.lon, args.elevation) }
  }))

  handle('sky:moon-info', validated('sky:moon-info', (args) => {
    return getMoonInfo(args.date)
  }))

  handle('sky:twilight', validated('sky:twilight', (args) => {
    return getTwilightTimes(args.date, args.lat, args.lon, args.elevation)
  }))

  handle('sky:target-visibility', validated('sky:target-visibility', (args) => {
    return { months: getTargetVisibility(args.target_id, args.lat, args.lon, args.elevation) }
  }))

  handle('planning:forward', async () => toForwardPlanView(await sky().planForward()))

  // fresh: Settings' check asks every source now instead of using the answers kept for Home.
  handle('weather:outlook', validated('weather:outlook', async (args) =>
    toClearSkiesView(await (args?.fresh ? sky().checkWeather() : sky().clearSkies()))))

  // Tonight's sky at a glance on Home: darkness, the moon, the cloud and the user's Bortle class.
  handle('sky:insight', validated('sky:insight', async () => toSkyInsightView(await sky().describeSkyInsight())))

  handle('sky:solve-target', validated('sky:solve-target', async (args) => {
    const result = await composeCore(getSqlite()).queueSolves(args.target_id, args.timing ?? 'now')
    if (result.job) kickJobs()
    return toSolveQueuedView(result)
  }))

  handle('sky:target-geometry', validated('sky:target-geometry', async (args) => {
    const g = await composeCore(getSqlite()).describeTargetGeometry(args.target_id)
    return g ? toTargetGeometryView(g) : null
  }))

  handle('mosaic:plan', validated('mosaic:plan', async (args) => toMosaicPlanView(await composeCore(getSqlite()).planMosaic(mosaicOptions(args)))))

  handle('mosaic:save', validated('mosaic:save', async (args) => {
    const core = composeCore(getSqlite())
    await core.saveMosaicPlan(args.target_id, {
      field: { widthDeg: args.field_width_deg, heightDeg: args.field_height_deg },
      rotationDeg: args.rotation_deg,
      overlap: args.overlap
    })
    return toMosaicPlanView(await core.planMosaic({ targetId: args.target_id }))
  }))

  handle('mosaic:export', validated('mosaic:export', async (args) => {
    const exported = await composeCore(getSqlite()).exportMosaicCsv(mosaicOptions(args))
    if (!exported) return { saved: false }
    return desktop.saveText(exported.fileName, exported.csv, CSV)
  }))

  // What another hour buys (specs/039-integration-forecasts): worked out from grading and coverage each time.
  handle('forecast:target', validated('forecast:target', async (args) => {
    const minutes = args.minutes && !FORECAST_MINUTES.includes(args.minutes) ? [...FORECAST_MINUTES, args.minutes].sort((a, b) => a - b) : FORECAST_MINUTES
    return toIntegrationView(await sky().integration.target(args.target_id, minutes), minutes)
  }))

  handle('forecast:mosaic', validated('forecast:mosaic', async (args) => {
    const m = await sky().integration.mosaic(args.workspace_id, args.revision)
    return m ? toMosaicIntegrationView(m) : null
  }))

  // Learning while you observe (specs/042-learning): the knowledge base, and its sources opened by
  // id only, so the page can never ask for an address of its own (LRN-005).
  handle('learning:library', async () => toLearningLibraryView())

  // A target in numbers: its published distance found by any of its names, its size from the catalogue.
  handle('learning:object', validated('learning:object', async (args) => toObjectNumbersView(await sky().objectNumbers(args.target_id))))

  handle('learning:tonight', validated('learning:tonight', async (args) => toTonightSkyView(tonightSky(args.latitude_deg, args.night, args.planned))))

  handle('learning:filters', validated('learning:filters', async (args) => filtersLight(args.filters, args.scopes).map(toFilterLightView)))

  // The gallery's pictures in order of how long their light travelled.
  handle('learning:lookback', validated('learning:lookback', async (args) => lookbackStrip(args.pictures, clock.now().getUTCFullYear()).map(toLookbackStopView)))

  handle('learning:fits', validated('learning:fits', async (args) => toFitsLearningView(explainHeaders(args.headers))))

  handle('learning:open-source', validated('learning:open-source', async (args) => {
    const url = sourceUrl(args.source_id)
    if (!url) return { opened: false }
    await desktop.openExternal(url)
    return { opened: true }
  }))
}
