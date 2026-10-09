import {
  DEFAULT_PLANNING_POLICY,
  channelGap,
  filterTotals,
  goalShortfallSec,
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

export interface PlanForwardOptions {
  /**
   * 'tonight' computes only tonight and the closing-season nights (about a month of skies) and
   * leaves windows and seasons empty; 'full' (the default) adds the year ahead.
   */
  scope?: 'tonight' | 'full'
}

export type PlanForward = (options?: PlanForwardOptions) => Promise<ForwardPlan>

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
  return async (options = {}) => {
    const full = options.scope !== 'tonight'
    const site = await deps.settings.site()
    if (!site) return { status: 'no-site' }

    const now = deps.clock.now()
    const cache = new Map<string, Promise<NightSky | null>>()
    const skyOn = (night: string) => {
      let sky = cache.get(night)
      if (!sky) {
        sky = deps.ephemeris.nightSky(site, night)
        cache.set(night, sky)
      }
      return sky
    }

    // Before noon the site is still in last night; once its darkness has ended, plan the coming one.
    let tonightDate = siteNightOf(now, site.longitudeDeg)
    const current = await skyOn(tonightDate)
    if (current && now.getTime() >= current.darkEnd.getTime()) tonightDate = nightsFrom(tonightDate, 2, 1)[1]

    // From the start of tonight's month, so the season table marks a new moon earlier this month.
    const monthStart = new Date(`${tonightDate.slice(0, 7)}-01T00:00:00Z`)
    const [frames, positions, hasNarrowbandFilter, newMoons] = await Promise.all([
      deps.frames.listTargetFrames(),
      deps.positions.listPositions(),
      deps.settings.hasNarrowbandFilter(),
      full ? deps.ephemeris.newMoons(monthStart, new Date(now.getTime() + horizon.seasonWeeks * 7 * DAY_MS)) : Promise.resolve([])
    ])
    const newMoonNights = newMoons.map(d => siteNightOf(d, site.longitudeDeg))

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
        shortOfGoalSec: goalShortfallSec(f),
        hasFinal: f.finalCount > 0,
        channel: channelGap(f),
        filters: filterTotals(f, { withLuminance: true })
      })
    }
    const open = targets.filter(hasWorkLeft).sort((a, b) => a.targetName.localeCompare(b.targetName))

    const hoursOn = (sky: NightSky | null, t: SkyTarget) => (sky ? usableHours(sky, site, t, policy) : 0)

    const closingNights = nightsFrom(tonightDate, horizon.closingDays, 1)
    const seasonNights = full ? nightsFrom(tonightDate, horizon.seasonWeeks, 7) : []
    const lastWindowNight = nightsFrom(tonightDate, horizon.windowDays + 1, 1)[horizon.windowDays]
    const soonWindows = newMoonWindows(newMoonNights, policy).filter(w => w.end >= tonightDate && w.newMoon <= lastWindowNight)
    const windowNights = soonWindows.map(w => w.newMoon)
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

    const windows: DarkWindowPlan[] = soonWindows.map(w => {
      const sky = skies.get(w.newMoon) ?? null
      const bestTargets = open
        .map(t => ({ targetId: t.targetId, targetName: t.targetName, usableHours: hoursOn(sky, t) }))
        .filter(t => t.usableHours >= policy.minUsableHours)
        .sort((a, b) => b.usableHours - a.usableHours || a.targetName.localeCompare(b.targetName))
        .slice(0, horizon.targetsPerWindow)
      return { ...w, bestTargets }
    })

    const seasons: TargetSeason[] = (full ? open : []).map(t => {
      // 52 weekly nights touch 13 calendar months; the view shows the first 12.
      const months = monthlySeason(
        seasonNights.map(n => ({ night: n, hours: hoursOn(skies.get(n) ?? null, t) })),
        newMoonNights
      ).slice(0, 12)
      const best = months.reduce<MonthSeason | null>((b, m) => (m.hoursPerNight > (b?.hoursPerNight ?? 0) ? m : b), null)
      return { targetId: t.targetId, targetName: t.targetName, months, bestMonth: best?.month ?? null }
    })

    return { status: 'ok', site, tonight, closing, windows, seasons }
  }
}
