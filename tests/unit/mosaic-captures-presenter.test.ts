import { describe, expect, it } from 'vitest'
import { makeAssignCapture, makeCreateWorkspace, makePlaceCaptures } from '@astro/application'
import { layoutGrid } from '@astro/domain'
import { FixedClock, gridDefinition, InMemoryMosaicAssignmentStore, InMemoryMosaicStore, InMemoryMosaicWorkspaceStore, InMemorySolveStore, skyFile, solvedField } from '@astro/testkit'
import { toCapturesView, toChangeViews } from '../../src/main/adapters/mosaic-workspace-presenter'
import { imageMatrix } from '../../src/renderer/components/mosaic/MosaicCanvas'
import { schemas } from '../../src/main/ipc/schemas'

async function placed() {
  const deps = { workspaces: new InMemoryMosaicWorkspaceStore(), assignments: new InMemoryMosaicAssignmentStore(), solves: new InMemorySolveStore(), mosaics: new InMemoryMosaicStore() }
  const clock = new FixedClock(new Date('2026-10-25T20:00:00Z'))
  const grid = gridDefinition({ centre: { raDeg: 180, decDeg: 0 }, rows: 1, columns: 2 })
  const made = await makeCreateWorkspace({ store: deps.workspaces, clock })({ name: 'T', targetId: 'ngc1', grid })
  if (!made.ok) throw new Error('no workspace')
  const [r1c1, r1c2] = layoutGrid(grid)
  deps.solves.add(
    ...[1, 2].map(n => skyFile({ path: `D:/a/n1/L_${n}.fit`, targetId: 'ngc1', exposureSec: 1800, filter: 'Ha', fileId: `f${n}` })),
    skyFile({ path: 'D:/a/n2/L.fit', targetId: 'ngc1', exposureSec: null }),
    skyFile({ path: 'D:/a/n3/L.fit', targetId: 'ngc1' })
  )
  await deps.solves.save({ path: 'D:/a/n1/L_1.fit', field: solvedField(r1c1.centre.raDeg, 0), source: 'astap', solvedAt: clock.now(), error: null })
  await deps.solves.save({ path: 'D:/a/n2/L.fit', field: solvedField(r1c2.centre.raDeg - 0.3, 0), source: 'astap', solvedAt: clock.now(), error: null })
  await makeAssignCapture({ ...deps, clock })(made.workspace.id, 'D:/a/n2/L.fit', { action: 'assign', panelId: 'R1C1', reason: 'log' })
  await makeAssignCapture({ ...deps, clock })(made.workspace.id, 'D:/gone.fit', { action: 'exclude', reason: 'trailed' })
  return (await makePlaceCaptures(deps)(made.workspace.id))!
}

describe('the mosaic captures presenter', () => {
  it('[MO-004, MO-009] Given placed, conflicting, unsolved and missing captures, When shown, Then each says where it is and the summary counts them', async () => {
    const view = toCapturesView(await placed())
    expect(view.summary).toBe('2 captures on 1 panel; 1 conflict, 1 not solved yet, 1 no longer in the index.')
    const [first, second] = view.placed
    expect(first).toMatchObject({ label: '2 lights, 2026-10-01, a/n1', files: 2, exposure: '1 h', filters: ['Ha'], fileId: 'f1', panelId: 'R1C1', state: 'accepted', source: 'computed', reason: null })
    expect(first.panels[0]).toEqual({ panelId: 'R1C1', share: '100%', coverage: '99%' })
    expect(second).toMatchObject({ panelId: 'R1C1', state: 'conflict', source: 'user-override', reason: 'log', exposure: null, primary: 'R1C2' })
    expect(view.unsolved).toEqual([{ id: 'D:/a/n3/L.fit', label: '1 light, 2026-10-01, a/n3', targetId: 'ngc1', solveError: null }])
    expect(view.missing).toEqual([{ captureId: 'D:/gone.fit', said: 'Left out', reason: 'trailed', lastCentre: null }])
    expect(view.targetIds).toEqual(['ngc1'])
  })

  it('[MO-010] Given captures that would change panel, When shown, Then each keeps its label, panels and whether it was placed by hand', () => {
    expect(toChangeViews([{ captureId: 'a', from: 'R1C1', to: null, label: 'x', overridden: true }])).toEqual([{ captureId: 'a', label: 'x', from: 'R1C1', to: null, overridden: true }])
  })

  it('[MO-007] Given a footprint on the drawing, When a thumbnail is laid on it, Then its corners land on the top left, top right and bottom left of the footprint', () => {
    const outline = [{ x: 1, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 1 }, { x: 1, y: 1 }]
    // SVG y points down, so north y = 2 is -2 on screen.
    expect(imageMatrix(outline)).toBe('matrix(2 0 0 1 1 -2)')
    expect(imageMatrix(outline.slice(0, 3))).toBeNull()
  })

  it('[MO-009] Given an assignment from the renderer, When validated, Then a panel id that is not RnCn or a missing panel is refused', () => {
    expect(schemas['workspace:assign'].parse({ action: 'assign', workspace_id: 'w1', capture_id: 'D:/a.fit', panel_id: 'R1C2' })).toMatchObject({ panel_id: 'R1C2' })
    expect(() => schemas['workspace:assign'].parse({ action: 'assign', workspace_id: 'w1', capture_id: 'D:/a.fit', panel_id: 'north' })).toThrow()
    expect(() => schemas['workspace:assign'].parse({ action: 'assign', workspace_id: 'w1', capture_id: 'D:/a.fit' })).toThrow()
    expect(schemas['workspace:assign'].parse({ action: 'clear', workspace_id: 'w1', capture_id: 'D:/a.fit' })).toEqual({ action: 'clear', workspace_id: 'w1', capture_id: 'D:/a.fit' })
  })
})
