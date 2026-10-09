import {
  COMET_POSITIONS_FILE,
  cometMotion,
  cometPosition,
  cometPositionsCsv,
  midExposure,
  parseMpcComet,
  planSirilWorkspace,
  type CometFramePosition,
  type CometMotion,
  type CometOrbit
} from '@astro/domain'
import type { CometStore } from '../ports/comet-store'
import type { SirilWorkspace } from '../ports/siril-workspace'
import type { Ephemeris, PlanningSettings } from '../ports/sky'
import type { StackCatalogue } from '../ports/stack-catalogue'
import { selectFrames } from './estimate-siril-run'
import type { FrameSelection } from './frame-grading'
import { WorkAreaOverlapsSourceError } from './prepare-siril-workspace'

export interface CometPlanDeps {
  comets: CometStore
  workspace: Pick<SirilWorkspace, 'listSourceFrames' | 'frameDetails' | 'writeText' | 'contains'>
  /** Grading, when wired: rejected lights get no position, since they are not stacked. */
  selection?: FrameSelection
  ephemeris: Pick<Ephemeris, 'observerPositions'>
  settings: Pick<PlanningSettings, 'site'>
  targets: Pick<StackCatalogue, 'describeTarget'>
}

export type CometPlan =
  /** Not a comet: neither its object type says so nor an orbit is set, so nothing is shown (RIG-016). */
  | { status: 'not-comet' }
  | {
      status: 'comet'
      /** Null until the user pastes the comet's MPC line. */
      orbit: CometOrbit | null
      /** One per light with a capture time, in time order, at mid-exposure (RIG-013). */
      positions: (CometFramePosition & { distanceAu: number })[]
      /** Lights with no capture time, left out of the file (RIG-015). */
      undated: number
      motion: CometMotion | null
      /** Positions are seen from the site in Settings; false means from the Earth's centre. */
      fromSite: boolean
      /** Where the positions file goes in the work folder; null without a work folder. */
      file: string | null
      /** Set when this call wrote the file. */
      written: boolean
    }

export type SetCometOrbit = (targetId: string, line: string | null) => Promise<{ ok: true; orbit: CometOrbit | null } | { ok: false; error: string }>
export type PlanComet = (targetId: string, sourceDir: string | null, workDir: string | null, options?: { write?: boolean }) => Promise<CometPlan>

/** Marks a target as a comet from its MPC line, or unmarks it with null; a line that does not read changes nothing (RIG-011, RIG-012). */
export function makeSetCometOrbit(deps: Pick<CometPlanDeps, 'comets'>): SetCometOrbit {
  return async (targetId, line) => {
    if (line === null) {
      await deps.comets.set(targetId, null)
      return { ok: true, orbit: null }
    }
    const parsed = parseMpcComet(line)
    if (!parsed.ok) return parsed
    await deps.comets.set(targetId, parsed.orbit)
    return { ok: true, orbit: parsed.orbit }
  }
}

/**
 * Where a comet is in each light (RIG-013), its motion across them, and, when asked, the positions
 * file for Siril's comet registration written into the work folder (RIG-014). The source folder is
 * only read, and a work folder that overlaps it is refused before anything is written.
 */
export function makePlanComet(deps: CometPlanDeps): PlanComet {
  return async (targetId, sourceDir, workDir, options = {}) => {
    const [orbit, target] = await Promise.all([deps.comets.get(targetId), deps.targets.describeTarget(targetId)])
    if (!orbit && target?.objectType !== 'comet') return { status: 'not-comet' }
    const file = workDir ? `${workDir.replace(/[\\/]+$/, '')}${workDir.includes('\\') && !workDir.includes('/') ? '\\' : '/'}${COMET_POSITIONS_FILE}` : null
    const empty = { status: 'comet' as const, orbit, positions: [], undated: 0, motion: null, fromSite: false, file, written: false }
    if (!orbit || !sourceDir) return empty

    const { frames, rejectedPaths } = await selectFrames(deps, sourceDir)
    const lights = planSirilWorkspace(frames).filter(p => p.folder === 'lights' && !rejectedPaths.has(p.from))
    const details = new Map((await deps.workspace.frameDetails(lights.map(l => l.from))).map(d => [d.path, d.settings]))
    const dated: { frame: string; at: Date }[] = []
    let undated = 0
    for (const l of lights) {
      const s = details.get(l.from)
      if (s?.capturedAt) dated.push({ frame: l.name, at: midExposure(s.capturedAt, s.exposureSec) })
      else undated++
    }
    const site = await deps.settings.site()
    const observers = await deps.ephemeris.observerPositions(site, dated.map(d => d.at))
    const positions = dated
      .map((d, i) => {
        const p = cometPosition(orbit, d.at, observers[i])
        return { frame: d.frame, at: d.at, raDeg: p.raDeg, decDeg: p.decDeg, distanceAu: p.distanceAu }
      })
      .sort((a, b) => a.at.getTime() - b.at.getTime() || a.frame.localeCompare(b.frame))

    let written = false
    if (options.write && workDir && positions.length > 0) {
      if ((await deps.workspace.contains(sourceDir, workDir)) || (await deps.workspace.contains(workDir, sourceDir))) {
        throw new WorkAreaOverlapsSourceError(workDir, sourceDir)
      }
      await deps.workspace.writeText(workDir, COMET_POSITIONS_FILE, cometPositionsCsv(positions))
      written = true
    }
    return { ...empty, positions, undated, motion: cometMotion(positions), fromSite: site !== null, written }
  }
}
