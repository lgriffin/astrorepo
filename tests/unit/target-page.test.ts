import fs from 'fs'
import path from 'path'
import { describe, it, expect } from 'vitest'
import { TARGET_TABS, runLine, runsForTarget, targetLink, targetTabFrom } from '../../src/shared/navigation'
import { toRecommendation } from '../../src/main/adapters/stacking-suggestion-presenter'
import type { JobView, JobsView } from '../../src/shared/types'

const renderer = path.resolve(__dirname, '../../src/renderer')
const read = (rel: string) => fs.readFileSync(path.join(renderer, rel), 'utf8')

const job = (over: Partial<JobView>): JobView => ({
  id: 'j',
  targetId: 't-m31',
  title: 'Stack M 31 with OSC_Preprocessing',
  kind: 'stack',
  state: 'queued',
  stateLabel: 'Queued',
  timing: 'window',
  queuedAt: '2026-09-30T20:00:00.000Z',
  startedAt: null,
  finishedAt: null,
  duration: null,
  estimate: null,
  waiting: 'Waits for the run window at 02:00 tomorrow.',
  note: null,
  command: 'siril-cli',
  needed: '4 GB',
  canCancel: true,
  canRunNow: true,
  ...over
})

const view = (over: Partial<JobsView>): Pick<JobsView, 'running' | 'queue' | 'history'> => ({ running: null, queue: [], history: [], ...over })

describe("A target's page", () => {
  it('[UX-009] Given a target, When its page opens, Then it has Overview, Stack and process, Files, and Notes and nights, each drawn on its own', () => {
    expect(TARGET_TABS.map(t => t.label)).toEqual(['Overview', 'Stack and process', 'Files', 'Notes and nights'])
    const page = read('pages/TargetDetail.tsx')
    for (const t of TARGET_TABS) expect(page).toContain(`tab === '${t.id}'`)
  })

  it('[UX-009] Given a link naming a part, When the page reads it, Then it opens on that part, and on Overview for none or an unknown one', () => {
    for (const t of TARGET_TABS) {
      const link = targetLink('t 1', t.id)
      const search = link.includes('?') ? link.slice(link.indexOf('?')) : ''
      expect(targetTabFrom(search)).toBe(t.id)
    }
    expect(targetLink('t 1')).toBe('/targets/t%201')
    expect(targetTabFrom('?tab=nope')).toBe('overview')
    expect(targetTabFrom('')).toBe('overview')
  })

  it('[UX-010] Given Stack and process, When it is drawn, Then stacking, post-processing and runs are numbered steps in that order', () => {
    const tab = read('components/target/ProcessTab.tsx')
    const at = (title: string) => tab.indexOf(`title="${title}"`)
    expect(at('1 · Stack')).toBeGreaterThan(-1)
    expect(at('1 · Stack')).toBeLessThan(at('2 · Post-process'))
    expect(at('2 · Post-process')).toBeLessThan(at('3 · Runs'))
    // Both steps queue into the same runner and refresh the target's runs when they do.
    expect(tab.match(/onQueued=\{onQueued\}/g)).toHaveLength(2)
  })

  it('[UX-011] Given a step whose job is already on its way, When the step is drawn, Then it does not offer to queue that step again', () => {
    const tab = read('components/target/ProcessTab.tsx')
    expect(tab).toContain('queued={runs.stack !== null}')
    expect(tab).toContain('queued={runs.postProcess !== null}')
    expect(tab).toContain('{chosen?.canQueue && !queued && (')
    expect(tab).toContain('{view.canQueue && view.stackPath && !queued && (')
  })

  it("[UX-011] Given the whole queue, When a target's runs are picked out, Then only its jobs appear, running first, with each step's job found", () => {
    const running = job({ id: 'r', state: 'running', stateLabel: 'Running', kind: 'post-process', title: 'Post-process M 31' })
    const mine = job({ id: 'q' })
    const other = job({ id: 'o', targetId: 't-m42' })
    const done = Array.from({ length: 7 }, (_, i) => job({ id: `d${i}`, state: 'succeeded', stateLabel: 'Succeeded' }))
    const runs = runsForTarget(view({ running, queue: [other, mine], history: [job({ id: 'x', targetId: 't-m42', state: 'failed' }), ...done] }), 't-m31')
    expect(runs.active.map(j => j.id)).toEqual(['r', 'q'])
    expect(runs.finished.map(j => j.id)).toEqual(['d0', 'd1', 'd2', 'd3', 'd4'])
    expect(runs.stack?.id).toBe('q')
    expect(runs.postProcess?.id).toBe('r')
    expect(runsForTarget(null, 't-m31')).toEqual({ active: [], finished: [], stack: null, postProcess: null })
  })

  it('[UX-011] Given a step whose job is on its way, When the step says so, Then it gives the job and why it waits, or that it runs', () => {
    expect(runLine(job({}))).toBe('Queued: Stack M 31 with OSC_Preprocessing. Waits for the run window at 02:00 tomorrow.')
    expect(runLine(job({ waiting: 'Starting now.' }))).toBe('Queued: Stack M 31 with OSC_Preprocessing. Starting now.')
    expect(runLine(job({ state: 'running' }))).toBe('Running now: Stack M 31 with OSC_Preprocessing.')
  })

  it('[UX-012] Given a stacking suggestion or a job, When the user opens its target, Then the target opens on Stack and process', () => {
    const rec = toRecommendation({ kind: 'ready-to-stack', id: 'ready-to-stack:t-m81', targetId: 't-m81', targetName: 'M 81', integrationSec: 29520, subCount: 2952, nights: 6 })
    expect(rec).toMatchObject({ actionLabel: 'Open the stacking plan', actionTo: '/targets/t-m81?tab=process' })
    const restack = toRecommendation({
      kind: 'restack', id: 'restack:t-m101', targetId: 't-m101', targetName: 'M 101', addedSec: 7800, addedSubCount: 1, lastStackedAt: new Date('2026-02-15T12:00:00Z')
    })
    expect(restack.actionTo).toBe('/targets/t-m101?tab=process')
    expect(read('pages/Jobs.tsx')).toContain("navigate(targetLink(job.targetId, 'process'))")
  })
})
