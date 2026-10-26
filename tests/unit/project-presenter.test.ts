import { describe, expect, it } from 'vitest'
import type { ProjectDescription } from '@astro/application'
import { DEFAULT_RULES, measureFilters, projectNextActions, projectProgress, rankExposure, summarise, targetTask, type CompletionRule } from '@astro/domain'
import { fromRuleView, ruleText, toProjectChange, toProjectSummaries, toProjectView, toRuleView, windowText } from '../../src/main/adapters/project-presenter'

const H = 3600
const rule: CompletionRule = { integration: { kind: 'per filter', goals: [{ filter: 'Ha', seconds: 2 * H }, { filter: 'OIII', seconds: 1.5 * H }] }, coverage: false, stacked: true, processed: false, published: true }
const project = {
  id: 'p1',
  name: 'Winter',
  kind: 'seasonal' as const,
  status: 'active' as const,
  rule,
  window: { start: '2026-11-01', end: '2027-02-28' },
  catalogueId: null,
  collectionId: 'fav',
  workspaceId: null,
  removedTargetIds: [],
  targetIds: ['m42'],
  createdAt: new Date('2026-10-26T20:00:00Z'),
  updatedAt: new Date('2026-10-26T20:00:00Z')
}

describe('project presenter', () => {
  it('[AP-001] Given a rule, When shown and edited, Then goals are in hours and come back as seconds', () => {
    expect(toRuleView(rule)).toEqual({ integration: 'per filter', goals: [{ filter: 'Ha', hours: 2 }, { filter: 'OIII', hours: 1.5 }], coverage: false, stacked: true, processed: false, published: true })
    expect(fromRuleView(toRuleView(rule))).toEqual(rule)
    expect(toRuleView(DEFAULT_RULES.mosaic)).toMatchObject({ integration: 'target goals', goals: [], coverage: true })
    expect(fromRuleView({ ...toRuleView(DEFAULT_RULES.catalogue) })).toEqual(DEFAULT_RULES.catalogue)
    expect(fromRuleView({ integration: 'per filter', goals: [{ filter: 'L', hours: 1 / 3 }], coverage: false, stacked: false, processed: false, published: false }).integration).toEqual({
      kind: 'per filter',
      goals: [{ filter: 'L', seconds: 1200 }]
    })
  })

  it('[AP-001] Given rules, When put in words, Then every asked part is named in order', () => {
    expect(ruleText(rule)).toBe('Finished means Ha 2 h and OIII 1 h 30 min of usable light, a stack and a finished image.')
    expect(ruleText(DEFAULT_RULES.mosaic)).toBe("Finished means every panel covered and each target's own integration goals met.")
    expect(ruleText(DEFAULT_RULES.catalogue)).toBe('Finished means a finished image.')
    expect(ruleText({ ...DEFAULT_RULES.catalogue, processed: true })).toBe('Finished means a processed file and a finished image.')
  })

  it('[AP-009] Given window states, When put in words, Then days are counted in the singular or plural', () => {
    expect(windowText({ state: 'open', daysLeft: 1 })).toBe('Open, 1 day left')
    expect(windowText({ state: 'open', daysLeft: 34 })).toBe('Open, 34 days left')
    expect(windowText({ state: 'not begun', daysToStart: 1 })).toBe('Starts in 1 day')
    expect(windowText({ state: 'not begun', daysToStart: 6 })).toBe('Starts in 6 days')
    expect(windowText({ state: 'closed' })).toBe('Closed')
  })

  it('[AP-003, AP-005] Given a described project, When shown, Then each task lists its parts, light per filter and next step, and the tallies stand apart', () => {
    const task = targetTask(
      { targetId: 'm42', name: 'M 42', acquired: [{ filter: 'Ha', seconds: 3 * H }], usable: [{ filter: 'Ha', seconds: 2 * H }, { filter: 'SII', seconds: 600 }], stacks: 1, processed: 0, published: 0, goals: [] },
      rule
    )
    const progress = projectProgress([task])
    const d: ProjectDescription = {
      project,
      progress,
      next: projectNextActions(progress.tasks),
      window: { state: 'not begun', daysToStart: 6 },
      mosaic: null,
      source: { kind: 'collection', id: 'fav', name: 'Favourites', notInProject: ['m1', 'm2'] },
      bottlenecks: rankExposure([
        { id: 'm42|OIII', label: 'M 42 OIII', summary: summarise([]) },
        { id: 'm42|Ha', label: 'M 42 Ha', summary: summarise(Array.from({ length: 12 }, () => ({ seconds: 600, filter: 'Ha', accepted: true, snr: null }))) }
      ]),
      at: new Date(2026, 9, 26, 21, 4)
    }
    const v = toProjectView(d)
    expect(v).toMatchObject({ id: 'p1', name: 'Winter', kindLabel: 'Seasonal campaign', status: 'active', done: 0, total: 1, complete: false, mosaic: null })
    expect(v.window).toEqual({ start: '2026-11-01', end: '2027-02-28', text: '2026-11-01 to 2027-02-28: Starts in 6 days' })
    expect(v.source).toEqual({ kind: 'collection', name: 'Favourites', newMembers: 2 })
    expect(v.checked).toBe('Worked out from the index at 21:04.')
    expect(v.tallies).toEqual([
      { part: 'integration', label: 'Integrated', met: 0, of: 1 },
      { part: 'stacked', label: 'Stacked', met: 1, of: 1 },
      { part: 'published', label: 'Published', met: 0, of: 1 }
    ])
    expect(v.tasks[0]).toEqual({
      id: 'm42',
      kind: 'target',
      label: 'M 42',
      stage: 'stacked',
      done: false,
      parts: [
        { part: 'integration', label: 'Integrated', met: false, detail: 'OIII needs 1.5 h' },
        { part: 'stacked', label: 'Stacked', met: true, detail: '1 stack' },
        { part: 'published', label: 'Published', met: false, detail: 'No finished image yet' }
      ],
      filters: [
        { filter: 'Ha', text: 'Ha 2 h of 2 h', met: true },
        { filter: 'OIII', text: 'OIII none of 1 h 30 min', met: false },
        { filter: 'SII', text: 'SII 10 min', met: null }
      ],
      next: 'Capture OIII on M 42: 1.5 h more'
    })
    expect(v.next).toEqual([{ taskId: 'm42', kind: 'capture', text: 'Capture OIII on M 42: 1.5 h more' }])
    expect(v.bottlenecks).toEqual([
      { label: 'M 42 Ha', gain: '+22%', range: expect.stringMatching(/^\+\d+% to \+\d+%$/), kind: 'theoretical' },
      { label: 'M 42 OIII', gain: null, range: null, kind: 'insufficient data' }
    ])
    expect(toProjectView({ ...d, window: null, source: null }).window).toBeNull()
    expect(toProjectView({ ...d, source: null }).source).toBeNull()
    expect(measureFilters([], [])).toEqual([])
  })

  it('[AP-001] Given summaries and results, When shown, Then each project has its kind, counts and window in words', () => {
    expect(toProjectSummaries([{ project, done: 2, total: 5, complete: false, window: { state: 'open', daysLeft: 3 } }])).toEqual([
      { id: 'p1', name: 'Winter', kind: 'seasonal', kindLabel: 'Seasonal campaign', status: 'active', done: 2, total: 5, complete: false, window: 'Open, 3 days left' }
    ])
    expect(toProjectSummaries([{ project, done: 0, total: 0, complete: false, window: null }])[0].window).toBeNull()
    expect(toProjectChange({ ok: true, project })).toEqual({ ok: true, id: 'p1' })
    expect(toProjectChange({ ok: false, problems: ['No.'] })).toEqual({ ok: false, problems: ['No.'] })
  })
})
