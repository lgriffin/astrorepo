import { describe, expect, it } from 'vitest'
import type { WorkspaceCoverage } from '@astro/application'
import { countOnce, coverageMap, layoutGrid, nextSession, panelProgress } from '@astro/domain'
import { gridDefinition } from '@astro/testkit'
import { toCoverageView } from '../../src/main/adapters/mosaic-workspace-presenter'

function coverage(goals: { filter: string; seconds: number }[], unsolved = 0): WorkspaceCoverage {
  const grid = gridDefinition({ centre: { raDeg: 180, decDeg: 0 }, rows: 1, columns: 2 })
  const panels = layoutGrid(grid)
  const counted = countOnce([
    { id: 'a', kind: 'lights', panelId: 'R1C1', frames: [{ path: '/a/1.fit', filter: 'Ha', seconds: 5400, hash: null, rejected: false }, { path: '/a/2.fit', filter: 'Ha', seconds: 60, hash: null, rejected: true }] }
  ])
  const map = coverageMap(grid.centre, panels, [{ id: 'a', footprint: panels[0].footprint, exposures: counted[0].exposures }])
  const progress = panelProgress(map.panels, counted, goals)
  const record = { id: 'w', name: 'Veil', targetId: 't', status: 'active' as const, createdAt: new Date(), latestRevision: 1 }
  return {
    workspace: record,
    revision: { workspaceId: 'w', revision: 1, grid, panels, note: null, savedAt: new Date() },
    map,
    progress,
    counted: counted.map(c => ({ ...c, label: '2 lights, 2026-10-01, v/n1', kind: 'lights' as const })),
    totals: [{ filter: 'Ha', seconds: 5400 }],
    goals,
    next: nextSession(panels, progress),
    unsolved
  }
}

describe('coverage view', () => {
  it('[MO-008, MO-018] Given one panel covered past its goal, When shown, Then each panel says its share, depth, gaps and per-filter progress in words', () => {
    const view = toCoverageView(coverage([{ filter: 'Ha', seconds: 3600 }]))
    expect(view.summary).toBe('1 of 2 panels covered; 1 meets the goals.')
    const [left, right] = view.panels
    expect(left).toMatchObject({ panelId: 'R1C1', state: 'covered', coverage: '100%', depth: '1 h 30 min', gaps: [], goalsMet: true, captures: 1 })
    expect(left.filters).toEqual([{ filter: 'Ha', have: '1 h 30 min', goal: '1 h', need: 'met', met: true }])
    expect(right.state).toBe('partly covered')
    expect(right.depth).toBe('none to 1 h 30 min')
    expect(right.gaps[0].centre).toMatch(/^\d\d:\d\d:\d\d [+-]\d\d:\d\d:\d\d$/)
    expect(right.filters).toEqual([{ filter: 'Ha', have: 'none', goal: '1 h', need: '1 h', met: false }])
    expect(view.totals).toEqual([{ filter: 'Ha', exposure: '1 h 30 min' }])
    expect(view.captures).toEqual([{ id: 'a', label: '2 lights, 2026-10-01, v/n1', kind: 'lights', panelId: 'R1C1', exposure: 'Ha 1 h 30 min', counted: 1, note: '1 frame rejected by grading.' }])
    expect(view.next.map(n => n.panelId)).toEqual(['R1C2'])
    expect(view.next[0].aim).toMatch(/^\d\d:\d\d:\d\d /)
    expect(view.maxSeconds).toBe(5400)
    expect(view.cells.length).toBeGreaterThan(0)
  })

  it('[MO-022] Given no goals and captures not solved yet, When shown, Then the summary leaves goals out and says what is not counted', () => {
    const view = toCoverageView(coverage([], 3))
    expect(view.summary).toBe('1 of 2 panels covered; 3 not solved yet, so not counted.')
    expect(view.panels[0].filters).toEqual([{ filter: 'Ha', have: '1 h 30 min', goal: null, need: null, met: null }])
    expect(view.unsolved).toBe(3)
  })
})
