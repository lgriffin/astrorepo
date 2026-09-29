import {
  DEFAULT_PLANNING_POLICY,
  hasWorkLeft,
  monthlySeason,
  newMoonWindows,
  nightsFrom,
  planTonight,
  seasonClosing,
  siteNightOf,
  totalSec,
  usableHours,
  usableSubs,
  type DarkWindow,
  type MonthSeason,
  type NightSky,
  type PlanningPolicy,
  type SeasonClosing,
  type Site,
  type SkyTarget,
  type TonightPlan
} from '@astro/domain'
import type { Clock } from '../ports/clock'
import type { FrameCatalogue } from '../ports/frame-catalogue'
import type { Ephemeris, PlanningSettings, TargetPositions } from '../ports/sky'

export interface PlanForwardDeps {
  frames: FrameCatalogue
  positions: TargetPositions
  settings: PlanningSettings
  ephemeris: Ephemeris
  clock: Clock
}

export interface TargetSeason {
  targetId: string
  targetName: string
  months: MonthSeason[]
  /** The month with the most usable hours per night, or null when it never rises high enough. */
  bestMonth: string | null
}

export interface ClosingTarget extends SeasonClosing {
  targetId: string
  targetName: string
}

export interface WindowTarget {
  targetId: string
  targetName: string
  usableHours: number
}

export interface DarkWindowPlan extends DarkWindow {
  /** Targets with work left and the most usable hours on the new-moon night, best first. */
  bestTargets: WindowTarget[]
}

export type ForwardPlan =
  | { status: 'no-site' }
  | {
      status: 'ok'
      site: Site
      /** Null when tonight has no dark window at all (the sun never gets 12° down). */
      tonight: TonightPlan | null
      closing: ClosingTarget[]
      windows: DarkWindowPlan[]
      seasons: TargetSeason[]
    }

export type PlanForward = () => Promise<ForwardPlan>

/** How far ahead each part of the plan looks. */
export interface PlanningHorizon {
  /** Weekly nights sampled for the 12-month season view. */
  seasonWeeks: number
  /** Daily nights sampled for closing-season warnings. */
  closingDays: number
  /** Days ahead to list new-moon windows. */
  windowDays: number
  /** Targets named per new-moon window. */
  targetsPerWindow: number
}

export const DEFAULT_HORIZON: PlanningHorizon = { seasonWeeks: 52, closingDays: 35, windowDays: 90, targetsPerWindow: 3 }

const DAY_MS = 24 * 3600 * 1000

/**
 * Forward planning from the user's site: tonight's choices, targets whose season is closing, the
 * next new-moon windows with what to shoot in them, and each target's 12-month season. Every night
 * is computed once and shared by all targets, so the cost grows with nights, not targets.
 */
export function makePlanForward(
  deps: PlanForwardDeps,
  policy: PlanningPolicy = DEFAULT_PLANNING_POLICY,
  horizon: PlanningHorizon = DEFAULT_HORIZON
): PlanForward {
  return async () => {
    const site = await deps.settings.site()
    if (!site) return { status: 'no-site' }

    const now = deps.clock.now()
    const tonightDate = siteNightOf(now, site.longitudeDeg)
    const [frames, positions, hasNarrowbandFilter, newMoons] = await Promise.all([
      deps.frames.listTargetFrames(),
      deps.positions.listPositions(),
      deps.settings.hasNarrowbandFilter(),
      deps.ephemeris.newMoons(now, new Date(now.getTime() + horizon.seasonWeeks * 7 * DAY_MS))
    ])

    const positionOf = new Map(positions.map(p => [p.targetId, p]))
    const targets: SkyTarget[] = []
    for (const f of frames) {
      const p = positionOf.get(f.targetId)
      if (!p) continue
      targets.push({
        targetId: f.targetId,
        targetName: f.targetName,
        raHours: p.raHours,
        decDeg: p.decDeg,
        objectType: p.objectType,
        integrationSec: totalSec(usableSubs(f)),
        goalSec: f.goalSec,
        hasFinal: f.finalCount > 0
      })
    }
    const open = targets.filter(hasWorkLeft).sort((a, b) => a.targetName.localeCompare(b.targetName))

    const cache = new Map<string, Promise<NightSky | null>>()
    const skyOn = (night: string) => {
      let sky = cache.get(night)
      if (!sky) {
        sky = deps.ephemeris.nightSky(site, night)
        cache.set(night, sky)
      }
      return sky
    }
    const hoursOn = (sky: NightSky | null, t: SkyTarget) => (sky ? usableHours(sky, site, t, policy) : 0)

    const closingNights = nightsFrom(tonightDate, horizon.closingDays, 1)
    const seasonNights = nightsFrom(tonightDate, horizon.seasonWeeks, 7)
    const windowEnd = now.getTime() + horizon.windowDays * DAY_MS
    const soonMoons = newMoons.filter(d => d.getTime() <= windowEnd)
    const windowNights = soonMoons.map(d => siteNightOf(d, site.longitudeDeg))
    const skies = new Map<string, NightSky | null>()
    for (const night of new Set([...closingNights, ...seasonNights, ...windowNights])) skies.set(night, await skyOn(night))

    const tonightSky = skies.get(tonightDate) ?? null
    const tonight = tonightSky ? planTonight(tonightSky, site, open, { hasNarrowbandFilter }, policy) : null

    const closing: ClosingTarget[] = []
    for (const t of open) {
      const c = seasonClosing(closingNights.map(n => ({ night: n, hours: hoursOn(skies.get(n) ?? null, t) })), policy)
      if (c) closing.push({ targetId: t.targetId, targetName: t.targetName, ...c })
    }
    closing.sort((a, b) => a.daysLeft - b.daysLeft || a.targetName.localeCompare(b.targetName))

    const windows: DarkWindowPlan[] = newMoonWindows(soonMoons, policy).map((w, i) => {
      const sky = skies.get(windowNights[i]) ?? null
      const bestTargets = open
        .map(t => ({ targetId: t.targetId, targetName: t.targetName, usableHours: hoursOn(sky, t) }))
        .filter(t => t.usableHours >= policy.minUsableHours)
        .sort((a, b) => b.usableHours - a.usableHours || a.targetName.localeCompare(b.targetName))
        .slice(0, horizon.targetsPerWindow)
      return { ...w, bestTargets }
    })

    const seasons: TargetSeason[] = open.map(t => {
      // 52 weekly nights touch 13 calendar months; the view shows the first 12.
      const months = monthlySeason(
        seasonNights.map(n => ({ night: n, hours: hoursOn(skies.get(n) ?? null, t) })),
        newMoons
      ).slice(0, 12)
      const best = months.reduce<MonthSeason | null>((b, m) => (m.hoursPerNight > (b?.hoursPerNight ?? 0) ? m : b), null)
      return { targetId: t.targetId, targetName: t.targetName, months, bestMonth: best?.month ?? null }
    })

    return { status: 'ok', site, tonight, closing, windows, seasons }
  }
}
