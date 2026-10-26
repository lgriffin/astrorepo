import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RULES,
  KIND_LABELS,
  MANIFEST_CSV_COLUMNS,
  PROJECT_KINDS,
  campaignWindowState,
  goalsFor,
  measureFilters,
  panelTask,
  missingMosaicTask,
  projectManifestCsv,
  projectManifestJson,
  projectManifestName,
  projectNextActions,
  projectProgress,
  ruleProblems,
  stageOf,
  targetTask,
  windowProblems,
  type CompletionRule,
  type PanelProgress,
  type TargetEvidence
} from '@astro/domain'

const rule = (over: Partial<CompletionRule> = {}): CompletionRule => ({ integration: { kind: 'none' }, coverage: false, stacked: false, processed: false, published: false, ...over })
const evidence = (over: Partial<TargetEvidence> = {}): TargetEvidence => ({
  targetId: 'm31',
  name: 'M 31',
  acquired: [],
  usable: [],
  stacks: 0,
  processed: 0,
  published: 0,
  goals: [],
  ...over
})
const panel = (over: Partial<PanelProgress> & { fraction?: number } = {}): PanelProgress => {
  const fraction = over.fraction ?? 0
  return {
    panelId: 'R1C1',
    state: fraction >= 0.95 ? 'covered' : fraction > 0 ? 'partly covered' : 'not started',
    coverage: { panelId: over.panelId ?? 'R1C1', fraction, covered: fraction >= 0.95, areaSqDeg: 1, shallowestSec: 0, deepestSec: 0, gaps: [] },
    filters: [],
    goalsMet: null,
    captures: 0,
    ...over
  }
}
const H = 3600

describe('completion rules', () => {
  it('[AP-001, AP-004] Given each of the five kinds, When started, Then it has a rule that asks for something and a label', () => {
    expect(PROJECT_KINDS).toEqual(['catalogue', 'seasonal', 'target-depth', 'mosaic', 'custom'])
    for (const kind of PROJECT_KINDS) {
      expect(ruleProblems(kind, DEFAULT_RULES[kind])).toEqual([])
      expect(KIND_LABELS[kind]).toMatch(/^[A-Z][a-z]/)
    }
    expect(DEFAULT_RULES.mosaic.coverage).toBe(true)
    expect(DEFAULT_RULES.catalogue.published).toBe(true)
  })

  it('[AP-006] Given a rule that asks for nothing, coverage outside a mosaic, or bad per-filter goals, When checked, Then each problem is named', () => {
    expect(ruleProblems('custom', rule())).toEqual(['Ask for at least one part: integration, coverage, a stack, a processed file or a finished image.'])
    expect(ruleProblems('seasonal', rule({ coverage: true }))).toEqual(['Only a mosaic campaign can ask for coverage.'])
    expect(ruleProblems('mosaic', rule({ coverage: true }))).toEqual([])
    expect(ruleProblems('custom', rule({ integration: { kind: 'per filter', goals: [] } }))).toEqual(['Name at least one filter and how long it needs.'])
    expect(
      ruleProblems('custom', rule({ integration: { kind: 'per filter', goals: [{ filter: ' ', seconds: 10 }, { filter: 'Ha', seconds: 0 }, { filter: 'ha', seconds: Number.NaN }] } }))
    ).toEqual(['Every goal needs a filter name; use "No filter" for frames without one.', 'Every goal needs a time above zero.', 'Each filter can have one goal only.'])
    expect(ruleProblems('custom', rule({ integration: { kind: 'per filter', goals: [{ filter: 'Ha', seconds: 1 }] } }))).toEqual([])
    expect(ruleProblems('custom', rule({ integration: { kind: 'target goals' } }))).toEqual([])
    for (const part of ['stacked', 'processed', 'published'] as const) expect(ruleProblems('custom', rule({ [part]: true }))).toEqual([])
  })

  it('[AP-001] Given a rule, When the goals for a target are asked, Then they are none, the target\'s own or the rule\'s', () => {
    const own = [{ filter: 'L', seconds: 100 }]
    expect(goalsFor(rule(), own)).toBeNull()
    expect(goalsFor(rule({ integration: { kind: 'target goals' } }), own)).toBe(own)
    expect(goalsFor(rule({ integration: { kind: 'per filter', goals: [{ filter: 'Ha', seconds: 5 }] } }), own)).toEqual([{ filter: 'Ha', seconds: 5 }])
  })
})

describe('seasonal windows', () => {
  it('[AP-009] Given a window, When today is before, inside or after it, Then it has not begun, is open with days left counting today, or is closed', () => {
    const w = { start: '2026-11-01', end: '2026-11-30' }
    expect(campaignWindowState(w, '2026-10-26')).toEqual({ state: 'not begun', daysToStart: 6 })
    expect(campaignWindowState(w, '2026-11-01')).toEqual({ state: 'open', daysLeft: 30 })
    expect(campaignWindowState(w, '2026-11-30')).toEqual({ state: 'open', daysLeft: 1 })
    expect(campaignWindowState(w, '2026-12-01')).toEqual({ state: 'closed' })
  })

  it('[AP-006] Given a window that is not two dates or ends before it starts, When checked, Then it is refused with the reason', () => {
    expect(windowProblems({ start: '2026-11-01', end: '2026-11-01' })).toEqual([])
    expect(windowProblems({ start: '2026-11-02', end: '2026-11-01' })).toEqual(['The window ends before it starts.'])
    for (const bad of ['', 'soon', '2026-13-01', '2026-02-30', '26-11-01', '2026-11-01T00:00'])
      expect(windowProblems({ start: bad, end: '2026-12-01' })).toEqual(['Give the window as two dates, such as 2026-11-01 and 2027-02-28.'])
    expect(windowProblems({ start: '2026-11-01', end: 'later' })).toHaveLength(1)
  })
})

describe('target tasks', () => {
  it('[AP-003] Given what a target has, When staged, Then the furthest of acquired, stacked, processed and published is taken', () => {
    expect(stageOf(evidence())).toBe('not observed')
    expect(stageOf(evidence({ acquired: [{ filter: 'L', seconds: 0 }] }))).toBe('not observed')
    expect(stageOf(evidence({ acquired: [{ filter: 'L', seconds: 60 }] }))).toBe('acquired')
    expect(stageOf(evidence({ stacks: 1 }))).toBe('stacked')
    expect(stageOf(evidence({ stacks: 1, processed: 2 }))).toBe('processed')
    expect(stageOf(evidence({ processed: 2, published: 1 }))).toBe('published')
  })

  it('[AP-001, AP-003] Given per-filter goals, When a target has usable light short of one, Then integration is not met, says what is short and the step captures the worst filter', () => {
    const r = rule({ integration: { kind: 'per filter', goals: [{ filter: 'Ha', seconds: 4 * H }, { filter: 'OIII', seconds: 4 * H }] } })
    const t = targetTask(evidence({ acquired: [{ filter: 'Ha', seconds: 5 * H }], usable: [{ filter: 'Ha', seconds: 3 * H }, { filter: 'OIII', seconds: 1 * H }] }), r)
    expect(t.parts).toEqual({ integration: { met: false, detail: 'Ha needs 1.0 h, OIII needs 3.0 h' } })
    expect(t.filters.map(f => [f.filter, f.haveSec, f.needSec])).toEqual([['Ha', 3 * H, H], ['OIII', H, 3 * H]])
    expect(t.done).toBe(false)
    expect(t.next).toEqual({ kind: 'capture', text: 'Capture OIII on M 31: 3.0 h more', needSec: 4 * H })
    expect(t).toMatchObject({ id: 'm31', kind: 'target', label: 'M 31', stage: 'acquired' })
  })

  it('[AP-003] Given usable light meeting every goal, When judged, Then integration is met and, with nothing else asked, the task is done with no step', () => {
    const r = rule({ integration: { kind: 'target goals' } })
    const t = targetTask(evidence({ usable: [{ filter: 'Ha', seconds: 2 * H }], goals: [{ filter: 'ha ', seconds: 2 * H }] }), r)
    expect(t.parts.integration).toEqual({ met: true, detail: 'Every goal met' })
    expect(t.done).toBe(true)
    expect(t.next).toBeNull()
  })

  it('[AP-010] Given the target\'s own goals and none set, When judged, Then integration is not met and the step asks for goals rather than claiming it done', () => {
    const t = targetTask(evidence({ usable: [{ filter: 'L', seconds: 20 * H }] }), rule({ integration: { kind: 'target goals' } }))
    expect(t.parts.integration).toEqual({ met: false, detail: 'No goals set' })
    expect(t.done).toBe(false)
    expect(t.next).toEqual({ kind: 'set goals', text: 'Set integration goals for M 31', needSec: null })
  })

  it('[AP-003] Given stacked, processed and published asked, When each exists or not, Then each part is reported on its own with a count', () => {
    const r = rule({ stacked: true, processed: true, published: true })
    expect(targetTask(evidence({ stacks: 2, processed: 1, published: 3 }), r).parts).toEqual({
      stacked: { met: true, detail: '2 stacks' },
      processed: { met: true, detail: '1 processed file' },
      published: { met: true, detail: '3 finished images' }
    })
    expect(targetTask(evidence({ stacks: 1, processed: 2, published: 1 }), r).parts).toEqual({
      stacked: { met: true, detail: '1 stack' },
      processed: { met: true, detail: '2 processed files' },
      published: { met: true, detail: '1 finished image' }
    })
    expect(targetTask(evidence(), r).parts).toEqual({
      stacked: { met: false, detail: 'No stack yet' },
      processed: { met: false, detail: 'Nothing processed yet' },
      published: { met: false, detail: 'No finished image yet' }
    })
  })

  it('[AP-005] Given output parts unmet, When the step is chosen, Then it is the earliest missing: lights, a stack, processing, then a finished image', () => {
    const published = rule({ published: true })
    expect(targetTask(evidence(), published).next).toEqual({ kind: 'capture', text: 'Capture lights of M 31', needSec: null })
    expect(targetTask(evidence({ usable: [{ filter: 'L', seconds: 1.5 * H }] }), published).next).toEqual({ kind: 'stack', text: 'Stack M 31: 1.5 h usable', needSec: null })
    expect(targetTask(evidence({ stacks: 1 }), published).next).toEqual({ kind: 'publish', text: 'Finish an image of M 31 and save it in its images folder', needSec: null })
    expect(targetTask(evidence({ processed: 1 }), published).next?.kind).toBe('publish')
    const processed = rule({ processed: true })
    expect(targetTask(evidence({ usable: [{ filter: 'L', seconds: H }] }), processed).next?.kind).toBe('stack')
    expect(targetTask(evidence({ stacks: 1 }), processed).next).toEqual({ kind: 'process', text: 'Process the stack of M 31', needSec: null })
    const stacked = rule({ stacked: true, processed: true })
    expect(targetTask(evidence({ usable: [{ filter: 'L', seconds: H }] }), stacked).next).toEqual({ kind: 'stack', text: 'Stack M 31: 1.0 h usable', needSec: null })
    expect(targetTask(evidence({ processed: 1, usable: [{ filter: 'L', seconds: H }] }), stacked).next?.kind).toBe('stack')
    // A stack and a processed file already there: only the image is missing.
    expect(targetTask(evidence({ stacks: 1, processed: 1 }), rule({ stacked: true, processed: true, published: true })).next?.kind).toBe('publish')
  })

  it('[AP-005] Given a processed file but no usable light and no stack, When a stack is asked, Then the step is to capture lights, never to stack nothing', () => {
    const stacked = rule({ stacked: true })
    expect(targetTask(evidence({ processed: 1 }), stacked).next).toEqual({ kind: 'capture', text: 'Capture lights of M 31', needSec: null })
    expect(targetTask(evidence({ processed: 1 }), rule({ processed: true, published: true })).next?.kind).toBe('publish')
  })

  it('[AP-005] Given integration and outputs both unmet, When the step is chosen, Then capturing comes before stacking', () => {
    const r = rule({ integration: { kind: 'per filter', goals: [{ filter: 'L', seconds: 2 * H }] }, stacked: true })
    expect(targetTask(evidence({ usable: [{ filter: 'L', seconds: H }] }), r).next?.kind).toBe('capture')
    expect(targetTask(evidence({ usable: [{ filter: 'L', seconds: 2 * H }] }), r).next?.kind).toBe('stack')
  })

  it('[AP-001] Given a mosaic target judged with integration off, When judged, Then only its outputs count', () => {
    const t = targetTask(evidence({ goals: [{ filter: 'L', seconds: H }] }), rule({ integration: { kind: 'target goals' }, published: true }), { integration: false })
    expect(Object.keys(t.parts)).toEqual(['published'])
    expect(t.filters).toEqual([])
  })
})

describe('panel tasks', () => {
  it('[AP-003] Given a panel covered but short of light, When judged, Then coverage is met and integration is not, reported apart', () => {
    const p = panel({ fraction: 0.97, filters: measureFilters([{ filter: 'Ha', seconds: H }], [{ filter: 'Ha', seconds: 3 * H }]) })
    const t = panelTask(p, rule({ coverage: true, integration: { kind: 'target goals' } }), [{ filter: 'Ha', seconds: 3 * H }], 'RA 00:42:44, Dec +41:16:08')
    expect(t.parts).toEqual({ coverage: { met: true, detail: '97% covered' }, integration: { met: false, detail: 'Ha needs 2.0 h' } })
    expect(t).toMatchObject({ id: 'R1C1', kind: 'panel', label: 'R1C1', stage: 'covered', done: false })
    expect(t.next).toEqual({ kind: 'capture', text: 'Capture Ha on R1C1: 2.0 h more', needSec: 2 * H })
  })

  it('[AP-005] Given a panel partly covered, When the step is chosen, Then it covers the panel at the aim and says how much is covered', () => {
    const goals = [{ filter: 'Ha', seconds: 3 * H }]
    const p = panel({ fraction: 0.4, filters: measureFilters([{ filter: 'Ha', seconds: H }], goals) })
    expect(panelTask(p, rule({ coverage: true, integration: { kind: 'target goals' } }), goals, 'RA 10:00:00, Dec +20:00:00').next).toEqual({
      kind: 'cover',
      text: 'Cover R1C1 (40% covered), aiming at RA 10:00:00, Dec +20:00:00',
      needSec: 2 * H
    })
    expect(panelTask(panel(), rule({ coverage: true }), null, null).next).toEqual({ kind: 'cover', text: 'Cover R1C1 (0% covered)', needSec: null })
  })

  it('[AP-010] Given a covered panel with no goals set, When integration is asked, Then the step asks for the mosaic\'s goals', () => {
    const t = panelTask(panel({ fraction: 1 }), rule({ coverage: true, integration: { kind: 'target goals' } }), [], null)
    expect(t.parts.integration).toEqual({ met: false, detail: 'No goals set' })
    expect(t.next).toEqual({ kind: 'set goals', text: 'Set integration goals for the mosaic', needSec: null })
  })

  it('[AP-010] Given an uncovered panel with no goals set, When integration is asked, Then setting goals comes before covering it', () => {
    const t = panelTask(panel({ fraction: 0.2 }), rule({ coverage: true, integration: { kind: 'target goals' } }), [], 'RA 10:00:00, Dec +20:00:00')
    expect(t.parts).toEqual({ coverage: { met: false, detail: '20% covered' }, integration: { met: false, detail: 'No goals set' } })
    expect(t.next).toEqual({ kind: 'set goals', text: 'Set integration goals for the mosaic', needSec: null })
  })

  it('[AP-003] Given a mosaic that is gone, When its panels are judged, Then one task stands for them that is never done', () => {
    const t = missingMosaicTask(rule({ coverage: true, integration: { kind: 'target goals' } }))
    expect(t).toMatchObject({ id: 'mosaic', kind: 'panel', stage: 'missing', done: false, filters: [] })
    expect(t.parts).toEqual({ coverage: { met: false, detail: 'The mosaic is gone' }, integration: { met: false, detail: 'The mosaic is gone' } })
    expect(t.next).toEqual({ kind: 'cover', text: 'The mosaic this project followed was deleted: start a new mosaic project to judge its panels', needSec: null })
    expect(missingMosaicTask(rule({ coverage: true })).parts).toEqual({ coverage: { met: false, detail: 'The mosaic is gone' } })
    expect(missingMosaicTask(rule({ integration: { kind: 'per filter', goals: [] } })).parts).toEqual({ integration: { met: false, detail: 'The mosaic is gone' } })
  })

  it('[AP-003] Given a covered panel and integration not asked, When judged, Then it is done and lists no filters', () => {
    const t = panelTask(panel({ fraction: 0.99, filters: measureFilters([{ filter: 'L', seconds: 5 }], []) }), rule({ coverage: true }), null, null)
    expect(t).toMatchObject({ done: true, next: null, filters: [] })
  })
})

describe('progress and next actions', () => {
  const r = rule({ integration: { kind: 'per filter', goals: [{ filter: 'L', seconds: 2 * H }] }, published: true })
  const tasks = [
    targetTask(evidence({ targetId: 'a', name: 'A', usable: [{ filter: 'L', seconds: 2 * H }], published: 1 }), r),
    targetTask(evidence({ targetId: 'b', name: 'B', usable: [{ filter: 'L', seconds: 2 * H }], stacks: 1 }), r),
    targetTask(evidence({ targetId: 'c', name: 'C', usable: [{ filter: 'L', seconds: 0.5 * H }] }), r),
    targetTask(evidence({ targetId: 'd', name: 'D', usable: [{ filter: 'L', seconds: 1.5 * H }] }), r)
  ]

  it('[AP-003] Given tasks, When tallied, Then each asked part is counted on its own beside the done total', () => {
    const p = projectProgress(tasks)
    expect(p).toMatchObject({ done: 1, total: 4, complete: false })
    expect(p.parts).toEqual([
      { part: 'integration', met: 2, of: 4 },
      { part: 'published', met: 1, of: 4 }
    ])
    expect(projectProgress([tasks[0]]).complete).toBe(true)
    expect(projectProgress([])).toEqual({ tasks: [], done: 0, total: 0, parts: [], complete: false })
  })

  it('[AP-005] Given unfinished tasks, When ranked, Then work needing no sky comes first and captures closest to done lead', () => {
    expect(projectNextActions(tasks).map(a => [a.taskId, a.kind])).toEqual([
      ['b', 'publish'],
      ['d', 'capture'],
      ['c', 'capture']
    ])
    const goals = targetTask(evidence({ targetId: 'g', name: 'G' }), rule({ integration: { kind: 'target goals' } }))
    const stack = targetTask(evidence({ targetId: 's', name: 'S', usable: [{ filter: 'L', seconds: H }] }), rule({ stacked: true }))
    const process = targetTask(evidence({ targetId: 'p', name: 'P', stacks: 1 }), rule({ processed: true }))
    const cover = panelTask(panel(), rule({ coverage: true }), null, null)
    expect(projectNextActions([cover, stack, process, goals, tasks[1]]).map(a => a.kind)).toEqual(['set goals', 'publish', 'process', 'stack', 'cover'])
    // Same kind and need: by name.
    const twin = (id: string, name: string) => targetTask(evidence({ targetId: id, name }), rule({ stacked: true }))
    expect(projectNextActions([twin('2', 'Zeta'), twin('1', 'Alpha')]).map(a => a.label)).toEqual(['Alpha', 'Zeta'])
    expect(projectNextActions(tasks)[0]).toMatchObject({ label: 'B', text: 'Finish an image of B and save it in its images folder' })
  })

  it('[AP-005] Given a cover step with a need and one without, When ranked, Then the one with a known need comes first', () => {
    const goals = [{ filter: 'Ha', seconds: 3 * H }]
    const known = panelTask(panel({ panelId: 'R1C2', fraction: 0.5, filters: measureFilters([], goals) }), rule({ coverage: true, integration: { kind: 'target goals' } }), goals, null)
    const unknown = panelTask(panel({ panelId: 'R1C1' }), rule({ coverage: true }), null, null)
    expect(projectNextActions([unknown, known]).map(a => a.taskId)).toEqual(['R1C2', 'R1C1'])
  })
})

describe('the manifest', () => {
  const r = rule({ integration: { kind: 'per filter', goals: [{ filter: 'L', seconds: 2 * H }] }, published: true })
  const progress = projectProgress([
    targetTask(evidence({ targetId: 'a', name: 'NGC 7000, "North America"', acquired: [{ filter: 'L', seconds: H }], usable: [{ filter: 'L', seconds: H }] }), r),
    targetTask(evidence({ targetId: 'b', name: 'M 1', usable: [{ filter: 'L', seconds: 2 * H }], published: 1 }), r)
  ])
  const input = { name: 'Winter, list', kind: 'custom' as const, status: 'active' as const, rule: r, window: null, progress, at: '2026-10-26T09:00:00.000Z' }

  it('[AP-007] Given a project, When exported as CSV, Then each task is a row with its stage, every part and its next step, quoted where needed', () => {
    const lines = projectManifestCsv(input).split('\n')
    expect(lines[0]).toBe(MANIFEST_CSV_COLUMNS.join(','))
    expect(lines[0]).toBe('project,task,kind,stage,done,coverage,integration,stacked,processed,published,next_step')
    expect(lines[1]).toBe('"Winter, list","NGC 7000, ""North America""",target,acquired,no,,not met: L needs 1.0 h,,,not met: No finished image yet,"Capture L on NGC 7000, ""North America"": 1.0 h more"')
    expect(lines[2]).toBe('"Winter, list",M 1,target,published,yes,,met: Every goal met,,,met: 1 finished image,')
    expect(lines).toHaveLength(4)
    expect(lines[3]).toBe('')
  })

  it('[AP-007] Given a project, When exported as JSON, Then the rule, the tallies and each task with its filters are there', () => {
    const json = JSON.parse(projectManifestJson({ ...input, window: { start: '2026-11-01', end: '2027-02-28' } }))
    expect(json).toMatchObject({ project: 'Winter, list', kind: 'custom', status: 'active', window: { start: '2026-11-01', end: '2027-02-28' }, rule: r, worked_out_at: '2026-10-26T09:00:00.000Z', done: 1, total: 2 })
    expect(json.parts).toEqual(progress.parts)
    expect(json.tasks[0]).toEqual({
      id: 'a',
      kind: 'target',
      label: 'NGC 7000, "North America"',
      stage: 'acquired',
      done: false,
      parts: progress.tasks[0].parts,
      filters: [{ filter: 'L', have_sec: H, goal_sec: 2 * H, need_sec: H }],
      next_step: 'Capture L on NGC 7000, "North America": 1.0 h more'
    })
    expect(json.tasks[1].next_step).toBeNull()
    expect(projectManifestJson(input).endsWith('}\n')).toBe(true)
  })

  it('[AP-007] Given a project name, When the file is named, Then unsafe characters become underscores', () => {
    expect(projectManifestName('Messier marathon', 'csv')).toBe('Messier_marathon-manifest.csv')
    expect(projectManifestName('  M/31: deep? ', 'json')).toBe('M_31_deep-manifest.json')
    expect(projectManifestName('???', 'csv')).toBe('project-manifest.csv')
  })
})
