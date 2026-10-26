import {
  countOnce,
  coverageMap,
  nextSession,
  nextSessionCsv,
  nextSessionExportName,
  nextSessionJson,
  panelProgress,
  type CountedCapture,
  type CoverageMap,
  type FilterSeconds,
  type NextSessionRow,
  type PanelProgress
} from '@astro/domain'
import type { FileHashStore } from '../ports/file-hashing'
import type { IntegrationGoalSource, StoredRevision, WorkspaceRecord } from '../ports/mosaic-workspace'
import type { FrameSelection } from './frame-grading'
import { captureLabel, makePlaceCaptures, type PlacementDeps } from './mosaic-placement'

export interface CoverageDeps extends PlacementDeps {
  /** Which lights grading leaves out (spec 025). */
  selection: Pick<FrameSelection, 'rejected'>
  /** Content hashes, so a frame copied to two folders counts once. */
  hashes: Pick<FileHashStore, 'listHashes'>
  goals: IntegrationGoalSource
}

export interface CountedCaptureView extends CountedCapture {
  label: string
  kind: 'lights' | 'master'
}

export interface WorkspaceCoverage {
  workspace: WorkspaceRecord
  revision: StoredRevision
  map: CoverageMap
  progress: PanelProgress[]
  /** What each capture on the mosaic adds, and why any of it does not count. */
  counted: CountedCaptureView[]
  /** Usable exposure on the mosaic per filter, each frame once whatever it overlaps. */
  totals: FilterSeconds[]
  /** The target's goals per filter, which each panel is measured against. */
  goals: FilterSeconds[]
  /** The panels to shoot next, most needed first. */
  next: NextSessionRow[]
  /** Captures of the mosaic's targets not solved yet: they add no coverage until they are. */
  unsolved: number
}

export type DescribeCoverage = (workspaceId: string, revision?: number) => Promise<WorkspaceCoverage | null>

/**
 * How far a revision of a mosaic has come (MO-008, MO-011): what each panel's counted captures
 * cover and add per filter against the target's goals, a map of exposure for a heat map, its gaps,
 * and the panels to shoot next. Coverage comes from solved footprints only; frames grading rejects
 * do not count, nor do copies of a frame counted elsewhere, nor a master over its own lights.
 */
export function makeDescribeCoverage(deps: CoverageDeps): DescribeCoverage {
  const place = makePlaceCaptures(deps)
  return async (workspaceId, wanted) => {
    const placed = await place(workspaceId, wanted)
    if (!placed) return null
    const { workspace, revision } = placed
    // Captures left out count for nothing; everything else on the grid counts where it falls.
    const onGrid = placed.placed.filter(p => p.assignment.state !== 'excluded' && p.placement.intersections.length > 0)
    const lights = onGrid.filter(p => p.capture.kind === 'lights').flatMap(p => p.capture.paths)
    const [rejected, hashes, goals] = await Promise.all([
      lights.length > 0 ? deps.selection.rejected(lights) : Promise.resolve(new Set<string>()),
      deps.hashes.listHashes(),
      workspace.targetId ? deps.goals.goalsOf(workspace.targetId) : Promise.resolve([])
    ])
    const hashOf = new Map(hashes.filter(h => h.fullHash).map(h => [h.path, h.fullHash as string]))
    const counted = countOnce(
      onGrid.map(p => ({
        id: p.capture.id,
        kind: p.capture.kind,
        panelId: p.assignment.panelId,
        frames: p.capture.paths.map((path, i) => ({
          path,
          filter: p.capture.pathFilters[i] ?? null,
          seconds: p.capture.exposures[i] ?? null,
          hash: hashOf.get(path) ?? null,
          rejected: rejected.has(path)
        }))
      }))
    )
    const byId = new Map(onGrid.map(p => [p.capture.id, p]))
    // A capture covers sky when something of it counts, or it is a master (its lights may be counted instead).
    const sources = counted
      .filter(c => c.counted > 0 || byId.get(c.id)?.capture.kind === 'master')
      .map(c => ({ id: c.id, footprint: (byId.get(c.id) as (typeof onGrid)[number]).footprint, exposures: c.exposures }))
    const map = coverageMap(revision.grid.centre, revision.panels, sources)
    const progress = panelProgress(map.panels, counted, goals)
    const totals = new Map<string, FilterSeconds>()
    for (const e of counted.flatMap(c => c.exposures)) {
      const key = e.filter.toLowerCase()
      totals.set(key, { filter: totals.get(key)?.filter ?? e.filter, seconds: (totals.get(key)?.seconds ?? 0) + e.seconds })
    }
    return {
      workspace,
      revision,
      map,
      progress,
      counted: counted.map(c => {
        const capture = (byId.get(c.id) as (typeof onGrid)[number]).capture
        return { ...c, label: captureLabel(capture), kind: capture.kind }
      }),
      totals: [...totals.values()].sort((a, b) => a.filter.localeCompare(b.filter)),
      goals,
      next: nextSession(revision.panels, progress),
      unsolved: placed.unsolved.length
    }
  }
}

export type ExportNextSession = (workspaceId: string, format: 'csv' | 'json', revision?: number) => Promise<{ fileName: string; text: string } | null>

/** The panels to shoot next as CSV or JSON: where to point, the turn, and what each still needs. */
export function makeExportNextSession(deps: CoverageDeps): ExportNextSession {
  const describe = makeDescribeCoverage(deps)
  return async (workspaceId, format, wanted) => {
    const coverage = await describe(workspaceId, wanted)
    if (!coverage) return null
    const input = { name: coverage.workspace.name, revision: coverage.revision.revision, rows: coverage.next }
    return { fileName: nextSessionExportName(input.name, input.revision, format), text: format === 'csv' ? nextSessionCsv(input) : nextSessionJson(input) }
  }
}
