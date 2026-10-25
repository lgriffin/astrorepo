import { describe, expect, it } from 'vitest'
import { previewGrid } from '@astro/application'
import { gridDefinition } from '@astro/testkit'
import { fieldFrom, toDrawingView, toGridDefinition, toGridInput, toRevisionSavedView } from '../../src/main/adapters/mosaic-workspace-presenter'
import { schemas } from '../../src/main/ipc/schemas'

describe('the mosaic workspace presenter', () => {
  it('[MO-001] Given a grid, When it goes to the editor and back, Then nothing is lost', () => {
    const g = gridDefinition({ positionAngleDeg: 12, field: { widthDeg: 0.72, heightDeg: 1.28, source: 'equipment', label: 'Seestar S50' } })
    expect(toGridDefinition(toGridInput(g))).toEqual(g)
  })

  it('[MO-001, MO-016] Given a laid-out grid with an outlook, When drawn, Then it says its size, overlap and turn, and each panel its nights', () => {
    const view = toDrawingView(previewGrid(gridDefinition({ positionAngleDeg: 20 })), {
      nightsLookedAt: 30,
      panels: [
        { panelId: 'R1C1', clearNights: 12, firstClear: '2026-10-26' },
        { panelId: 'R1C2', clearNights: 0, firstClear: null }
      ]
    })
    expect(view.summary).toBe('2 × 2 panels, 15% overlap across and down, up axis at +20.0° east of north, covering 1.3° × 2.4°.')
    expect(view.panels[0].outlook).toBe('Clear on 12 of the next 30 nights, from 2026-10-26')
    expect(view.panels[1].outlook).toBe('Not clear of the altitude limit on any of the next 30 nights')
    expect(view.panels[2].outlook).toBeNull()
    expect(view.bounds?.x).toBeGreaterThan(1)
    expect(view.centre).toBe('00:42:44 +41:16:08')
  })

  it('[MO-015] Given a grid with problems, When drawn, Then the problems are shown and no panels', () => {
    const view = toDrawingView(previewGrid(gridDefinition({ columns: 0 })))
    expect(view).toMatchObject({ ok: false, panels: [], bounds: null, problems: ['Columns must be a whole number from 1 to 12.'] })
  })

  it('[MO-002] Given each save outcome, When shown, Then it says what happened in a sentence', () => {
    expect(toRevisionSavedView('w1', { status: 'saved', revision: 3 }).message).toBe('Saved as revision 3. Earlier revisions are kept.')
    expect(toRevisionSavedView('w1', { status: 'unchanged', revision: 2 }).message).toBe('Nothing changed since revision 2, so no new revision was saved.')
    expect(toRevisionSavedView('w1', { status: 'no-workspace' })).toMatchObject({ ok: false, workspaceId: null })
    expect(toRevisionSavedView('w1', { status: 'stale', revision: 4 })).toMatchObject({ ok: false, revision: 4, message: 'Revision 4 was saved meanwhile, so this grid was not saved. Open the latest revision and try again.' })
    expect(fieldFrom(gridDefinition({ field: { widthDeg: 0.72, heightDeg: 1.28, source: 'equipment', label: 'Seestar S50' } }))).toBe('Field 43′ × 77′ from Seestar S50 (equipment)')
  })

  it('[MO-015] Given a grid past sane bounds from the renderer, When validated, Then it is refused before it reaches the core; one the core can word is let through', () => {
    expect(() => schemas['workspace:create'].parse({ name: 'x', grid: { ...toGridInput(gridDefinition()), rows: 5000 } })).toThrow()
    expect(() => schemas['workspace:create'].parse({ name: 'x', grid: { ...toGridInput(gridDefinition()), rows: 2.5 } })).toThrow()
    // 13 rows, no overlap or a zero field reach the core, which says what is wrong in words.
    const typed = schemas['workspace:preview'].parse({ grid: { ...toGridInput(gridDefinition()), rows: 13, overlap_x: 0.7, field_width_deg: 0 } })
    expect(previewGrid(toGridDefinition(typed.grid))).toMatchObject({ ok: false, problems: ['Rows must be a whole number from 1 to 12.', 'The overlap across must be from 0% to 60%.', "Each panel's field must be more than 0° and at most 30° on a side."] })
    expect(schemas['workspace:preview'].parse({ grid: toGridInput(gridDefinition()), drag: { x_deg: 0.5, y_deg: -0.2 } })).toMatchObject({ drag: { x_deg: 0.5 } })
  })
})
