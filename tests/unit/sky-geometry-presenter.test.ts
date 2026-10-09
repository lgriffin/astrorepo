import { describe, expect, it } from 'vitest'
import type { MosaicPlanResult, TargetGeometry } from '@astro/application'
import { planMosaic, rankNextActions } from '@astro/domain'
import { solvedField } from '@astro/testkit'
import { fieldSize, nightRanges, toMosaicPlanView, toSolveQueuedView, toTargetGeometryView } from '../../src/main/adapters/sky-geometry-presenter'
import { toMosaicTileRecommendation, toNextActionRecommendation } from '../../src/main/adapters/stacking-suggestion-presenter'
import { schemas } from '../../src/main/ipc/schemas'
import { runsForTarget } from '../../src/shared/navigation'
import type { JobView } from '../../src/shared/types'

function geometry(over: Partial<TargetGeometry> = {}): TargetGeometry {
  return {
    targetId: 'm31',
    solves: [
      { path: 'D:\\astro\\M31\\L_001.fit', kind: 'light', night: '2026-10-01', field: solvedField(10.6847, 41.2688, { rotationDeg: -12.3 }), source: 'astap', error: null, solvedAt: new Date() },
      { path: '/astro/M31/stack.fit', kind: 'master', night: null, field: null, source: 'siril', error: 'Siril finished without printing a solution.', solvedAt: new Date() },
      { path: '/astro/M31/L_9.fit', kind: 'light', night: '2026-10-02', field: solvedField(10.7, 41.3), source: 'header', error: null, solvedAt: new Date() }
    ],
    unsolved: 2,
    misfiled: null,
    rotation: { nights: [{ night: '2026-10-01', rotationDeg: -12.3 }, { night: '2026-10-02', rotationDeg: 0 }], spreadDeg: 12.3 },
    mosaic: { plan: null, grouping: { panels: [], mosaic: [], tiles: [] }, linkedTargetIds: [] },
    ...over
  }
}

describe('Sky geometry presenter', () => {
  it('[SKY-001] Given solves and a failure, When presented, Then each row reads its centre, field, scale, rotation and source, or why it failed', () => {
    const view = toTargetGeometryView(geometry())
    expect(view.summary).toBe('2 files placed on the sky, 1 could not be solved. 2 files still to solve: one light from each folder of each night, and each master.')
    expect(view.solves[0]).toEqual({
      path: 'D:\\astro\\M31\\L_001.fit',
      name: 'L_001.fit',
      kind: 'light',
      night: '2026-10-01',
      solved: true,
      centre: '00:42:44 +41:16:08',
      scale: '2.39"/px',
      rotation: '-12.3°',
      field: '43′ × 76′',
      source: 'ASTAP',
      error: null
    })
    expect(view.solves[1]).toMatchObject({ solved: false, centre: null, error: 'Siril finished without printing a solution.', source: 'Siril' })
    expect(view.solves[2].source).toBe('Its own headers')
    expect(toTargetGeometryView(geometry({ solves: [], unsolved: 0 })).summary).toBe('No file of this target has been placed on the sky yet.')
  })

  it('[SKY-005, SKY-006] Given a misfiled target and nights turned apart, When presented, Then it says what to check and that the field turns', () => {
    const view = toTargetGeometryView(geometry({ misfiled: { far: 2, of: 3, nearestDeg: 71.04, fieldDeg: 1.27 } }))
    expect(view.misfiled).toBe(
      'May be filed under the wrong name: 2 of 3 solved files point 71.0° or more from where the catalogue puts it, wider than their 1.3° field. Check the object name in the headers, or link the files to the right target.'
    )
    expect(view.rotation.nights).toEqual([
      { night: '2026-10-01', rotation: '-12.3°' },
      { night: '2026-10-02', rotation: '0.0°' }
    ])
    expect(view.rotation.note).toMatch(/^The field turns by up to 12\.3° between nights/)
    expect(toTargetGeometryView(geometry({ rotation: { nights: [{ night: 'a', rotationDeg: 1 }, { night: 'b', rotationDeg: 2 }], spreadDeg: 1 } })).rotation.note).toMatch(/same rotation every night/)
    expect(toTargetGeometryView(geometry({ rotation: { nights: [], spreadDeg: 0 } })).rotation.note).toBeNull()
  })

  it('[SKY-011] Given two panels of one mosaic, one filed under another target, When presented, Then the panels and the link are described', () => {
    const view = toTargetGeometryView(
      geometry({
        mosaic: {
          plan: null,
          linkedTargetIds: ['m31-p2'],
          grouping: {
            mosaic: [1, 2],
            tiles: [],
            panels: [
              { id: 1, raDeg: 10.68, decDeg: 41.27, integrationSec: 3600, lightCount: 360, nights: ['a'], targetIds: ['m31'], tile: 1 },
              { id: 2, raDeg: 11.3, decDeg: 41.27, integrationSec: 600, lightCount: 60, nights: ['a', 'b'], targetIds: ['m31-p2'], tile: null },
              { id: 3, raDeg: 50, decDeg: 41.27, integrationSec: 600, lightCount: 60, nights: ['b'], targetIds: ['m31'], tile: null }
            ]
          }
        }
      })
    )
    expect(view.mosaic).toBe('2 panels of one mosaic, with lights filed under 1 other target linked to this one.')
    expect(view.panels[1]).toMatchObject({ otherTargets: ['m31-p2'], inMosaic: true, integration: '10 m', nights: 2 })
    expect(view.panels[2].inMosaic).toBe(false)
    expect(toTargetGeometryView(geometry()).mosaic).toBeNull()
    expect(toSolveQueuedView({ fromHeaders: 0, toSolve: 1, job: null, solver: null, message: 'x' })).toEqual({ message: 'x', queued: false })
    expect(fieldSize(2.5, 1)).toBe('2.5° × 1.0°')
  })

  it('[SKY-007, SKY-008] Given a planned mosaic with nights, When presented, Then the grid, tiles, goal and runs of clear nights read in sentences', () => {
    const plan = planMosaic({ centre: { raDeg: 10.6847, decDeg: 41.2688 }, targetWidthArcmin: 178, targetHeightArcmin: 178, field: { widthDeg: 0.72, heightDeg: 1.28 }, rotationDeg: 0, overlap: 0.2 })
    const nights = ['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13'].map((night, i) => ({ night, hours: 3, clear: i !== 2 }))
    const result: MosaicPlanResult = {
      status: 'ok',
      target: { id: 'm31', name: 'M 31', raHours: 0.71, decDeg: 41.27, sizeArcmin: 178, goalSec: 6 * 3600 },
      plan,
      fieldFrom: 'request',
      saved: null,
      tiles: plan.tiles.map(t => ({ tile: t.index, capturedSec: t.index === 1 ? 3600 : 0, lightCount: t.index === 1 ? 360 : 0, neededSec: t.index === 2 ? 0 : 5 * 3600 })),
      nights
    }
    const view = toMosaicPlanView(result)
    expect(view.summary).toBe('5 × 3 panels at 20% overlap, turned 0°, covering 3.0° × 3.3° of a target 3.0° × 3.0° across.')
    expect(view.tiles[0]).toMatchObject({ tile: 1, row: 1, column: 1, captured: '1 h', needed: '5 h', lights: 360 })
    expect(view.tiles[0].ra).toMatch(/^00:4\d:\d\d$/)
    expect(view.tiles[0].dec).toMatch(/^\+42:\d\d:\d\d$/)
    expect(view.tiles[1]).toMatchObject({ captured: 'Nothing yet', needed: 'Done' })
    expect(view.goalNote).toBe('Each panel needs 6 h for your goal, 90 h in all.')
    expect(view.nights).toEqual({ clear: 4, of: 5, ranges: ['9 Oct to 10 Oct', '12 Oct to 13 Oct'], summary: 'Every panel is above 30° for at least an hour in darkness on 4 nights of the next 5.' })
    expect(view.fieldFrom).toBe('the scope and camera picked')
    expect(nightRanges([{ night: '2026-11-02', hours: 2, clear: true }])).toEqual(['2 Nov'])
    const none = toMosaicPlanView({ ...result, target: { ...result.target, goalSec: null }, nights: nights.map(n => ({ ...n, clear: false })), tiles: [] })
    expect(none.nights?.summary).toBe('No night in the next 5 keeps every panel above 30° for an hour in darkness.')
    expect(none.goalNote).toMatch(/^Set an integration goal/)
    expect(none.tiles[0].needed).toBeNull()
    expect(toMosaicPlanView({ ...result, nights: null }).nights).toBeNull()
  })

  it('[SKY-010] Given a target that fits one field or a plan that cannot be drawn, When presented, Then it says so', () => {
    const plan = planMosaic({ centre: { raDeg: 10, decDeg: 41 }, targetWidthArcmin: 20, targetHeightArcmin: 20, field: { widthDeg: 0.72, heightDeg: 1.28 }, rotationDeg: 0, overlap: 0.2 })
    const target = { id: 'm57', name: 'M 57', raHours: 18.9, decDeg: 33, sizeArcmin: 20, goalSec: null }
    expect(toMosaicPlanView({ status: 'ok', target, plan, fieldFrom: 'saved', saved: null, tiles: [], nights: null }).summary).toBe('M 57 (20′ × 20′) fits in one 43′ × 77′ field, so it needs no mosaic.')
    expect(toMosaicPlanView({ status: 'no-field', target })).toMatchObject({ status: 'no-field', targetId: 'm57', message: expect.stringMatching(/Pick a scope and camera from Equipment/) })
    expect(toMosaicPlanView({ status: 'no-target' })).toMatchObject({ targetId: null, message: 'That target is not in the index.' })
    expect(toMosaicPlanView({ status: 'no-size', target }).message).toMatch(/no catalogue size/)
    expect(toMosaicPlanView({ status: 'no-position', target }).message).toMatch(/no catalogue position/)
  })

  it('[SKY-012] Given tiles with no lights, When shown in Next actions, Then each names the tile and the nights it is up, and opens the mosaic plan', () => {
    const [a, b, c, d] = rankNextActions([], null, [], [
      { targetId: 'm31', targetName: 'M 31', tile: 2, of: 6, nights: ['2026-10-10', '2026-10-11', '2026-10-24'], lookedAt: 30, goalSec: 6 * 3600 },
      { targetId: 'm31', targetName: 'M 31', tile: 3, of: 6, nights: ['2026-10-12'], lookedAt: 30, goalSec: null },
      { targetId: 'm31', targetName: 'M 31', tile: 4, of: 6, nights: [], lookedAt: 30, goalSec: null },
      { targetId: 'm31', targetName: 'M 31', tile: 5, of: 6, nights: [], lookedAt: 0, goalSec: null }
    ])
    expect(toNextActionRecommendation(a)).toMatchObject({
      id: 'mosaic-tile:m31:2',
      category: 'capture',
      title: 'M 31 · tile 2 of 6 has no lights',
      description: 'It is up for at least an hour above 30° on 3 nights of the next 30, first on 10 Oct and last on 24 Oct. Each panel needs 6 h for your goal.',
      actionLabel: 'Open the mosaic plan',
      actionTo: '/sky-planner?mosaic=m31#mosaic'
    })
    if (b.kind !== 'mosaic-tile' || c.kind !== 'mosaic-tile' || d.kind !== 'mosaic-tile') throw new Error('expected tiles')
    expect(toMosaicTileRecommendation(b).description).toBe('It is up for at least an hour above 30° on 1 night of the next 30, first on 12 Oct.')
    expect(toMosaicTileRecommendation(c).description).toBe('It does not clear 30° for an hour on any of the next 30 nights.')
    expect(toMosaicTileRecommendation(d).description).toBe('Set your site in Settings to see the nights it is visible.')
  })

  it('[NFR-018] Given the sky geometry channels, When their arguments are validated, Then good requests pass and bad ones are refused', () => {
    expect(schemas['sky:solve-target'].parse({ target_id: 'm31' })).toEqual({ target_id: 'm31' })
    expect(() => schemas['sky:solve-target'].parse({ target_id: 'm31', timing: 'later' })).toThrow()
    expect(schemas['sky:target-geometry'].parse({ target_id: 'm31' })).toEqual({ target_id: 'm31' })
    expect(schemas['mosaic:plan'].parse({ target_id: 'm31', field_width_deg: 0.72, field_height_deg: 1.28, rotation_deg: 30, overlap: 0.2 })).toMatchObject({ overlap: 0.2 })
    expect(() => schemas['mosaic:plan'].parse({ target_id: 'm31', overlap: 0.9 })).toThrow()
    expect(() => schemas['mosaic:save'].parse({ target_id: 'm31', rotation_deg: 0, overlap: 0.2 })).toThrow()
    expect(schemas['mosaic:export'].parse({ target_id: 'm31' })).toEqual({ target_id: 'm31' })
  })

  it("[SKY-003] Given a plate solve job beside a stack, When a target's runs are listed, Then only the stack is a run", () => {
    const job = (id: string, kind: JobView['kind']) => ({ id, kind, targetId: 'm31', state: 'succeeded' }) as JobView
    const runs = runsForTarget({ running: null, queue: [job('q', 'solve')], history: [job('s', 'solve'), job('t', 'stack')] }, 'm31')
    expect(runs.active).toEqual([])
    expect(runs.finished.map(j => j.id)).toEqual(['t'])
  })
})
