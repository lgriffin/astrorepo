import { expect } from 'vitest'
import { makeCreateWorkspace, makeDescribeCoverage, type WorkspaceCoverage } from '@astro/application'
import { formatDuration } from '../../src/main/adapters/job-presenter'
import { layoutGrid, parseDec, parseRa, type PlannedPanel } from '@astro/domain'
import {
  FixedClock,
  InMemoryFileHashStore,
  InMemoryIntegrationGoalSource,
  InMemoryMosaicAssignmentStore,
  InMemoryMosaicStore,
  InMemoryMosaicWorkspaceStore,
  InMemorySolveStore,
  skyFile,
  solvedField
} from '@astro/testkit'
import { defineSteps } from '@astro/testkit/bdd'

class Coverage {
  readonly workspaces = new InMemoryMosaicWorkspaceStore()
  readonly assignments = new InMemoryMosaicAssignmentStore()
  readonly solves = new InMemorySolveStore()
  readonly mosaics = new InMemoryMosaicStore()
  readonly hashes = new InMemoryFileHashStore()
  readonly clock = new FixedClock(new Date('2026-10-26T20:00:00Z'))
  readonly rejected = new Set<string>()
  goals = new InMemoryIntegrationGoalSource()
  panels: PlannedPanel[] = []
  workspaceId = ''
  folder = 'D:/astro/ngc4565/2026-10-01'
  paths: string[] = []
  coverage: WorkspaceCoverage | null = null
}

const panel = (w: Coverage, id: string) => w.panels.find(p => p.id === id) as PlannedPanel
const progress = (w: Coverage, id: string) => w.coverage?.progress.find(p => p.panelId === id)

export const coverageSteps = defineSteps(() => new Coverage(), ({ Given, When, Then }) => {
  Given('a mosaic of {int} row by {int} columns at RA {word} Dec {word} for target {string} with a goal of {int} h of {string}', async (w, rows: number, columns: number, ra: string, dec: string, target: string, hours: number, filter: string) => {
    const grid = {
      centre: { raDeg: parseRa(ra) as number, decDeg: parseDec(dec) as number },
      positionAngleDeg: 0,
      rows,
      columns,
      overlapX: 0.15,
      overlapY: 0.15,
      field: { widthDeg: 0.72, heightDeg: 1.28, source: 'manual' as const, label: 'Seestar S50' }
    }
    w.panels = layoutGrid(grid)
    w.goals = new InMemoryIntegrationGoalSource([{ targetId: target, filter, seconds: hours * 3600 }])
    const made = await makeCreateWorkspace({ store: w.workspaces, clock: w.clock })({ name: 'NGC 4565', targetId: target, grid })
    if (!made.ok) throw new Error('no mosaic')
    w.workspaceId = made.workspace.id
  })

  const lights = (w: Coverage, count: number, filter: string, seconds: number) => {
    w.paths = Array.from({ length: count }, (_, i) => `${w.folder}/Light_${String(i + 1).padStart(3, '0')}.fit`)
    w.solves.add(...w.paths.map(path => skyFile({ path, targetId: 'ngc4565', filter, exposureSec: seconds })))
  }
  const solveAt = (w: Coverage, at: { raDeg: number; decDeg: number }) =>
    w.solves.save({ path: w.paths[0], field: solvedField(at.raDeg, at.decDeg), source: 'astap', solvedAt: w.clock.now(), error: null })

  Given('a night of {int} lights of {string} of {int} s solved at the centre of {word}', async (w, count: number, filter: string, seconds: number, id: string) => {
    lights(w, count, filter, seconds)
    await solveAt(w, panel(w, id).centre)
  })
  Given('a night of {int} lights of {string} of {int} s solved at the centre of the grid', async (w, count: number, filter: string, seconds: number) => {
    lights(w, count, filter, seconds)
    await solveAt(w, { raDeg: 180, decDeg: 0 })
  })
  Given('a night of {int} lights of {string} of {int} s not solved yet', (w, count: number, filter: string, seconds: number) => {
    lights(w, count, filter, seconds)
  })
  Given('grading rejected {int} of them', (w, count: number) => {
    for (const path of w.paths.slice(-count)) w.rejected.add(path)
  })

  When('coverage is worked out', async w => {
    const selection = { rejected: async (paths: string[]) => new Set(paths.filter(p => w.rejected.has(p))) }
    const deps = { workspaces: w.workspaces, assignments: w.assignments, solves: w.solves, mosaics: w.mosaics, selection, hashes: w.hashes, goals: w.goals }
    w.coverage = await makeDescribeCoverage(deps)(w.workspaceId)
  })

  Then('{word} is covered with {word} {word} of {string} toward its goal', (w, id: string, amount: string, unit: string, filter: string) => {
    const p = progress(w, id)
    expect(p?.state).toBe('covered')
    const f = p?.filters.find(x => x.filter === filter)
    expect(formatDuration(f?.haveSec ?? 0)).toBe(`${amount} ${unit}`)
    expect(f?.needSec).toBeGreaterThan(0)
  })
  Then('{word} is only partly covered', (w, id: string) => {
    expect(progress(w, id)?.state).toBe('partly covered')
  })
  Then('both panels are partly covered', w => {
    expect(w.coverage?.progress.map(p => p.state)).toEqual(['partly covered', 'partly covered'])
  })
  Then('the mosaic holds {word} {word} of {string} in all', (w, amount: string, unit: string, filter: string) => {
    expect(w.coverage?.totals.map(t => `${t.filter} ${formatDuration(t.seconds)}`)).toEqual([`${filter} ${amount} ${unit}`])
  })
  Then('no panel is covered and {int} capture is listed as not solved', (w, count: number) => {
    expect(w.coverage?.progress.every(p => p.state === 'not started')).toBe(true)
    expect(w.coverage?.map.cells.every(c => c.captures === 0)).toBe(true)
    expect(w.coverage?.unsolved).toBe(count)
  })
  Then('the next session lists only {word}, where the other panel only overlaps it', (w, id: string) => {
    expect(w.coverage?.next.map(n => n.panel.id)).toEqual([id])
    expect(w.coverage?.next[0].reason).toMatch(/^\d+% covered, uncovered: most of the panel; Ha needs 1\.0 h more$/)
  })
})
