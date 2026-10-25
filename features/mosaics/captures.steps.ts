import { expect } from 'vitest'
import { makeAssignCapture, makeCreateWorkspace, makePlaceCaptures, makePreviewRevisionChanges, type CapturePlacements, type RevisionChange } from '@astro/application'
import { layoutGrid, parseDec, parseRa, type GridDefinition, type PlannedPanel } from '@astro/domain'
import { FixedClock, InMemoryMosaicAssignmentStore, InMemoryMosaicStore, InMemoryMosaicWorkspaceStore, InMemorySolveStore, skyFile, solvedField } from '@astro/testkit'
import { defineSteps } from '@astro/testkit/bdd'

class Captures {
  readonly workspaces = new InMemoryMosaicWorkspaceStore()
  readonly assignments = new InMemoryMosaicAssignmentStore()
  readonly solves = new InMemorySolveStore()
  readonly mosaics = new InMemoryMosaicStore()
  readonly clock = new FixedClock(new Date('2026-10-25T20:00:00Z'))
  grid: GridDefinition | null = null
  panels: PlannedPanel[] = []
  workspaceId = ''
  night = 'D:/astro/ngc4565/2026-10-01/Light_001.fit'
  placed: CapturePlacements | null = null
  changes: RevisionChange[] | null = null

  get deps() {
    return { workspaces: this.workspaces, assignments: this.assignments, solves: this.solves, mosaics: this.mosaics }
  }
}

export const captureSteps = defineSteps(() => new Captures(), ({ Given, When, Then }) => {
  Given('a mosaic of {int} row by {int} columns at RA {word} Dec {word} for target {string}', async (w, rows: number, columns: number, ra: string, dec: string, target: string) => {
    w.grid = {
      centre: { raDeg: parseRa(ra) as number, decDeg: parseDec(dec) as number },
      positionAngleDeg: 0,
      rows,
      columns,
      overlapX: 0.15,
      overlapY: 0.15,
      field: { widthDeg: 0.72, heightDeg: 1.28, source: 'manual', label: 'Seestar S50' }
    }
    w.panels = layoutGrid(w.grid)
    const made = await makeCreateWorkspace({ store: w.workspaces, clock: w.clock })({ name: 'NGC 4565', targetId: target, grid: w.grid })
    if (!made.ok) throw new Error('no mosaic')
    w.workspaceId = made.workspace.id
  })

  const lights = (w: Captures, count: number, target: string) => {
    const folder = w.night.slice(0, w.night.lastIndexOf('/'))
    w.solves.add(...Array.from({ length: count }, (_, i) => skyFile({ path: `${folder}/Light_${String(i + 1).padStart(3, '0')}.fit`, targetId: target, exposureSec: 10 })))
  }
  const solveAt = (w: Captures, raDeg: number, decDeg: number) => w.solves.save({ path: w.night, field: solvedField(raDeg, decDeg), source: 'astap', solvedAt: w.clock.now(), error: null })
  Given('a night of {int} lights of {string} solved at the centre of {word}', async (w, count: number, target: string, panel: string) => {
    lights(w, count, target)
    const p = w.panels.find(x => x.id === panel) as PlannedPanel
    await solveAt(w, p.centre.raDeg, p.centre.decDeg)
  })
  Given('a night of {int} lights of {string} solved on the western side of {word}', async (w, count: number, target: string, panel: string) => {
    lights(w, count, target)
    const p = w.panels.find(x => x.id === panel) as PlannedPanel
    await solveAt(w, p.centre.raDeg - 0.3, p.centre.decDeg)
  })
  Given('a night of {int} lights of {string} solved at the centre of the grid', async (w, count: number, target: string) => {
    lights(w, count, target)
    await solveAt(w, w.grid?.centre.raDeg ?? 0, w.grid?.centre.decDeg ?? 0)
  })
  Given('a night of {int} lights of {string} not solved yet', (w, count: number, target: string) => lights(w, count, target))

  When('the captures are placed', async w => {
    w.placed = await makePlaceCaptures(w.deps)(w.workspaceId)
  })
  When('I put that night on {word} by hand because {string}', async (w, panel: string, reason: string) => {
    expect(await makeAssignCapture({ ...w.deps, clock: w.clock })(w.workspaceId, w.night, { action: 'assign', panelId: panel, reason })).toEqual({ ok: true })
    w.placed = await makePlaceCaptures(w.deps)(w.workspaceId)
  })
  When('I move the grid one and a half panels east', async w => {
    const grid = w.grid as GridDefinition
    const step = grid.field.widthDeg * (1 - grid.overlapX)
    w.changes = await makePreviewRevisionChanges(w.deps)(w.workspaceId, { ...grid, centre: { ...grid.centre, raDeg: grid.centre.raDeg + 1.5 * step } })
  })

  const theNight = (w: Captures) => {
    const found = w.placed?.placed.find(p => p.capture.id === w.night)
    if (!found) throw new Error('that night is not placed')
    return found
  }
  Then("that night is on {word}, accepted, drawn on the grid's projection", (w, panel: string) => {
    const p = theNight(w)
    expect(p.capture.paths).toHaveLength(40)
    expect(p.assignment).toMatchObject({ panelId: panel, state: 'accepted', source: 'computed' })
    expect(p.outline).toHaveLength(4)
  })
  Then('that night overlaps {word} and {word} and is marked to review', (w, a: string, b: string) => {
    const p = theNight(w)
    expect(p.placement.intersections.map(i => i.panelId).sort()).toEqual([a, b].sort())
    expect(p.assignment.state).toBe('needs-review')
  })
  Then('no panel has that night and it is listed as not solved', w => {
    expect(w.placed?.placed).toEqual([])
    expect(w.placed?.unsolved.map(u => u.paths.length)).toEqual([40])
  })
  Then('that night counts toward {word} as a conflict, with its computed panel still {word}', (w, panel: string, computed: string) => {
    const p = theNight(w)
    expect(p.assignment).toMatchObject({ panelId: panel, state: 'conflict', source: 'user-override' })
    expect(p.override?.reason).toBe('the scope log says so')
    expect(p.placement.primary).toBe(computed)
  })
  Then('I am told that night would move from {word} to {word}', (w, from: string, to: string) => {
    expect(w.changes?.map(c => [c.captureId, c.from, c.to])).toEqual([[w.night, from, to]])
  })
  Then('revision {int} still places it on {word}', async (w, revision: number, panel: string) => {
    w.placed = await makePlaceCaptures(w.deps)(w.workspaceId, revision)
    expect(theNight(w).assignment.panelId).toBe(panel)
  })
})
