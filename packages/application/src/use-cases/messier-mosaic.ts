import {
  DEFAULT_PLANNING_POLICY,
  MESSIER_COUNT,
  closestMoonDeg,
  deriveProgress,
  messierGapsTonight,
  messierOutlook,
  messierState,
  messierSummary,
  monthlySeason,
  moonRulesOut,
  nightsFrom,
  orderPictures,
  peakMoonIllumination,
  seasonClosing,
  totalSec,
  usableHours,
  usableSubs,
  type MessierGap,
  type MessierOutlook,
  type MessierState,
  type MessierSummary,
  type MonthSeason,
  type NightSky,
  type PictureCandidate,
  type PlanningPolicy,
  type Site,
  type TargetFrames
} from '@astro/domain'
import type { Clock } from '../ports/clock'
import type { FrameCatalogue } from '../ports/frame-catalogue'
import type { MessierCatalogue, MessierObject, TilePicture, TilePictures } from '../ports/messier'
import type { Ephemeris, PlanningSettings } from '../ports/sky'
import { DEFAULT_HORIZON, tonightAt, type PlanningHorizon } from './plan-forward'

export interface MessierMosaicDeps {
  messier: MessierCatalogue
  frames: FrameCatalogue
  pictures: TilePictures
  settings: PlanningSettings
  ephemeris: Ephemeris
  clock: Clock
}

/** One object's tile (MES-001, MES-002, MES-005). */
export interface MessierTile {
  number: number
  designation: string
  name: string | null
  targetId: string
  objectType: string
  constellation: string | null
  magnitude: number | null
  state: MessierState
  /** Usable light integration so far. */
  integrationSec: number
  /** The image the tile tries first (MES-003); null when the object has none it can draw. */
  picture: { name: string; kind: PictureCandidate['kind'] } | null
  /** When it can be shot; null without a site or a catalogue position. */
  outlook: MessierOutlook | null
  /** Usable hours per night in each of the coming 12 months, and whether that is in season; empty without a site. */
  months: MessierMonth[]
}

export interface MessierMonth extends MonthSeason {
  /** The month offers the policy's minimum usable hours per night. */
  inSeason: boolean
}

export interface MessierMosaic {
  /** The night the outlooks are for; null without a site. */
  night: string | null
  siteSet: boolean
  /** How many Messier objects the catalogue holds; fewer than 110 means it is not fully loaded. */
  catalogued: number
  tiles: MessierTile[]
  summary: MessierSummary
}

/** A tile's picture, or why none of its images could be drawn (MES-004). */
export type TileDrawing = ({ ok: true; name: string; kind: PictureCandidate['kind'] } & TilePicture) | { ok: false; error: string }

/** A request the mosaic turns down without reading anything (MES-011). */
export class MessierRefusedError extends Error {}

/** The widest tile picture drawn (MES-003): sharp on a large screen, small to send. */
export const TILE_PICTURE_MAX_WIDTH = 512
/** The narrowest tile picture drawn. */
export const TILE_PICTURE_MIN_WIDTH = 32
/** Drawn pictures kept, so reopening the mosaic redraws only what changed (MES-012). */
export const TILE_PICTURE_CACHE = 300
/** Night skies kept between calls, so Home's refreshes and reopening the mosaic do not work them out again. */
export const NIGHT_SKY_CACHE = 128

const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path
const reason = (error: unknown) => (error instanceof Error ? error.message : String(error))

interface Base {
  object: MessierObject
  frames: TargetFrames | undefined
  outlook: MessierOutlook | null
  months: MessierMonth[]
}

/**
 * The Messier mosaic (spec 032): every object's tile with the user's own image of it, what is
 * missing, and when each gap is up from the site, reusing the forward plan's sky and policy.
 */
export function makeMessierMosaic(deps: MessierMosaicDeps, policy: PlanningPolicy = DEFAULT_PLANNING_POLICY, horizon: PlanningHorizon = DEFAULT_HORIZON) {
  const drawn = new Map<string, TilePicture>()
  /** Night skies by site and night: the ephemeris gives the same answer each time. */
  const nightSkies = new Map<string, Promise<NightSky | null>>()
  /** The last outlooks worked out, by site, night, filter and reach; positions do not move. */
  let outlooks: { key: string; byNumber: Map<number, { outlook: MessierOutlook | null; months: MessierMonth[] }> } | null = null
  let queue: Promise<unknown> = Promise.resolve()
  /** Draws one picture at a time, however many tiles ask together (MES-012). */
  const oneAtATime = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task)
    queue = run.catch(() => undefined)
    return run
  }

  /** Each object with its frames and, given a site, its outlook; `full` adds the 12 months ahead. */
  async function base(full: boolean): Promise<{ night: string | null; siteSet: boolean; rows: Base[] }> {
    const [objects, frames, site] = await Promise.all([deps.messier.objects(), deps.frames.listTargetFrames(), deps.settings.site()])
    const framesOf = new Map(frames.map(f => [f.targetId, f]))
    if (!site) return { night: null, siteSet: false, rows: objects.map(object => ({ object, frames: framesOf.get(object.targetId), outlook: null, months: [] })) }
    const sky = await skies(site, full)
    const key = `${sky.siteKey}|${sky.night}|${full}|${sky.hasNarrowbandFilter}`
    if (outlooks?.key !== key) outlooks = { key, byNumber: new Map() }
    const byNumber = outlooks.byNumber
    const rows = objects.map(object => {
      const known = object.raHours === null || object.decDeg === null ? undefined : byNumber.get(object.number)
      const found = known ?? outlookOf(object, site, sky)
      if (!known && object.raHours !== null && object.decDeg !== null) byNumber.set(object.number, found)
      return { object, frames: framesOf.get(object.targetId), ...found }
    })
    return { night: sky.night, siteSet: true, rows }
  }

  async function skies(site: Site, full: boolean) {
    const siteKey = `${site.latitudeDeg},${site.longitudeDeg},${site.elevationM}`
    const skyOn = (night: string) => {
      const key = `${siteKey}|${night}`
      let sky = nightSkies.get(key)
      if (!sky) {
        sky = deps.ephemeris.nightSky(site, night)
        nightSkies.set(key, sky)
        sky.catch(() => nightSkies.delete(key))
        if (nightSkies.size > NIGHT_SKY_CACHE) nightSkies.delete(nightSkies.keys().next().value as string)
      }
      return sky
    }
    const night = await tonightAt(deps.clock.now(), site, skyOn)
    const closingNights = nightsFrom(night, horizon.closingDays, 1)
    const seasonNights = full ? nightsFrom(night, horizon.seasonWeeks, 7) : []
    const byNight = new Map<string, NightSky | null>()
    for (const n of new Set([...closingNights, ...seasonNights])) byNight.set(n, await skyOn(n))
    const tonight = byNight.get(night) ?? null
    const brightMoon = tonight ? peakMoonIllumination(tonight) > policy.brightMoonIllumination : false
    return { siteKey, night, closingNights, seasonNights, byNight, tonight, brightMoon, hasNarrowbandFilter: await deps.settings.hasNarrowbandFilter() }
  }

  function outlookOf(object: MessierObject, site: Site, sky: Awaited<ReturnType<typeof skies>>): { outlook: MessierOutlook | null; months: MessierMonth[] } {
    if (object.raHours === null || object.decDeg === null) return { outlook: null, months: [] }
    const position = { raHours: object.raHours, decDeg: object.decDeg }
    const hoursOn = (n: string) => {
      const s = sky.byNight.get(n) ?? null
      return s ? usableHours(s, site, position, policy) : 0
    }
    const tonight = sky.tonight
      ? {
          hours: usableHours(sky.tonight, site, position, policy),
          moonSeparationDeg: closestMoonDeg(sky.tonight, site, position, policy),
          moonBlocks: moonRulesOut(sky.brightMoon, object.objectType, sky)
        }
      : null
    const closing = seasonClosing(sky.closingNights.map(n => ({ night: n, hours: hoursOn(n) })), policy)
    // 52 weekly nights touch 13 calendar months; the mosaic looks at the first 12, as the Sky planner does.
    const months = monthlySeason(sky.seasonNights.map(n => ({ night: n, hours: hoursOn(n) })), []).slice(0, 12)
    return { outlook: messierOutlook({ tonight, closing, months }, policy), months: months.map(m => ({ ...m, inSeason: m.hoursPerNight >= policy.minUsableHours })) }
  }

  /**
   * The tile's state (MES-002): imaged exactly when a finished image is there to show, whatever the
   * last scan counted (a file deleted since leaves the count behind); otherwise from its frames.
   */
  const stateOf = (frames: TargetFrames | undefined, pictures: PictureCandidate[]): MessierState => {
    if (pictures.some(p => p.kind === 'finished')) return 'imaged'
    return messierState(frames ? deriveProgress({ ...frames, finalCount: 0 }) : null)
  }

  return {
    /** Every Messier object's tile, in Messier order, and the counts above them (MES-001 to MES-005). */
    async mosaic(): Promise<MessierMosaic> {
      const { night, siteSet, rows } = await base(true)
      const tiles = await Promise.all(
        rows.map(async ({ object, frames, outlook, months }): Promise<MessierTile> => {
          const candidates = orderPictures(await deps.messier.pictures(object.targetId))
          const first = candidates[0]
          return {
            number: object.number,
            designation: object.designation,
            name: object.name,
            targetId: object.targetId,
            objectType: object.objectType,
            constellation: object.constellation,
            magnitude: object.magnitude,
            state: stateOf(frames, candidates),
            integrationSec: frames ? totalSec(usableSubs(frames)) : 0,
            picture: first ? { name: baseName(first.path), kind: first.kind } : null,
            outlook,
            months
          }
        })
      )
      tiles.sort((a, b) => a.number - b.number)
      return { night, siteSet, catalogued: tiles.length, tiles, summary: messierSummary(tiles) }
    },

    /**
     * A tile's picture: the first of the object's images, in the order of MES-003, that draws.
     * A finished image is drawn as it is and a master auto-stretched (MES-003, MES-004). Null when
     * the object has no image to draw.
     */
    async picture(number: number, maxWidth = 256): Promise<TileDrawing | null> {
      if (!Number.isInteger(number) || number < 1 || number > MESSIER_COUNT) throw new MessierRefusedError(`There is no Messier object ${number}; they run from 1 to ${MESSIER_COUNT}.`)
      const width = Math.round(Math.min(TILE_PICTURE_MAX_WIDTH, Math.max(TILE_PICTURE_MIN_WIDTH, Number.isFinite(maxWidth) ? maxWidth : TILE_PICTURE_MAX_WIDTH)))
      const object = (await deps.messier.objects()).find(o => o.number === number)
      if (!object) return null
      const candidates = orderPictures(await deps.messier.pictures(object.targetId))
      if (candidates.length === 0) return null
      const failures: string[] = []
      for (const c of candidates) {
        const key = `${width}|${c.modifiedAt?.getTime() ?? 'unknown'}|${c.path}`
        let picture = drawn.get(key)
        if (!picture) {
          try {
            picture = await oneAtATime(() => deps.pictures.draw(c.path, { maxWidth: width, stretch: c.kind === 'master' }))
          } catch (error) {
            failures.push(`${baseName(c.path)}: ${reason(error)}`)
            continue
          }
          drawn.set(key, picture)
          if (drawn.size > TILE_PICTURE_CACHE) drawn.delete(drawn.keys().next().value as string)
        }
        return { ok: true, name: baseName(c.path), kind: c.kind, ...picture }
      }
      return { ok: false, error: failures.join(' ') }
    },

    /**
     * Messier objects with nothing captured that are up tonight, best first (MES-008), for Next
     * actions. Looks only at tonight and the closing-season nights; empty without a site.
     */
    async gapsTonight(limit?: number): Promise<MessierGap[]> {
      const { rows } = await base(false)
      const candidates = messierGapsTonight(
        rows.map(({ object, frames, outlook }) => ({
          number: object.number,
          designation: object.designation,
          targetId: object.targetId,
          targetName: object.name ? `${object.designation} ${object.name}` : object.designation,
          state: stateOf(frames, []),
          outlook
        })),
        MESSIER_COUNT
      )
      // The finished images decide imaged (MES-002): a gap whose image is in its folder is not a gap after all.
      const gaps: MessierGap[] = []
      for (const gap of candidates) {
        if (limit !== undefined && gaps.length >= limit) break
        if (!(await deps.messier.pictures(gap.targetId)).some(p => p.kind === 'finished')) gaps.push(gap)
      }
      return gaps
    }
  }
}

export type MessierMosaicService = ReturnType<typeof makeMessierMosaic>
