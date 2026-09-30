import fs from 'fs'
import path from 'path'
import { describe, it, expect } from 'vitest'
import { withQueuedJobs } from '../../src/main/adapters/stacking-suggestion-presenter'
import type { Recommendation } from '../../src/shared/types'

const renderer = path.resolve(__dirname, '../../src/renderer')
const read = (rel: string) => fs.readFileSync(path.join(renderer, rel), 'utf8')

const rec = (over: Partial<Recommendation>): Recommendation => ({
  id: 'ready-to-stack:t-m31',
  category: 'stacking',
  priority: 'high',
  title: 'M 31 · 8 h, never stacked',
  description: '',
  targetId: 't-m31',
  targetName: 'M 31',
  actionLabel: 'View Target',
  dismissible: true,
  ...over
})

const job = (over: Partial<{ targetId: string; kind: 'stack' | 'post-process'; state: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'; timing: 'window' | 'now' }>) => ({
  targetId: 't-m31',
  kind: 'stack' as const,
  state: 'queued' as const,
  timing: 'window' as const,
  ...over
})

describe('Home', () => {
  it('[UX-006] Given Home, When it is drawn, Then Next actions come first, then Coming nights and hidden data, then progress', () => {
    const home = read('pages/Dashboard.tsx')
    const at = (title: string) => home.indexOf(`title="${title}"`)
    expect(at('Next actions')).toBeGreaterThan(-1)
    expect(at('Next actions')).toBeLessThan(at('Coming nights'))
    expect(at('Coming nights')).toBeLessThan(at('Hidden in your files'))
    expect(at('Hidden in your files')).toBeLessThan(at('Where your targets are'))
  })

  it('[UX-006] Given the totals and breakdowns, When the app is drawn, Then they are on Insights, not Home', () => {
    expect(read('pages/Dashboard.tsx')).not.toContain('dashboard:stats')
    expect(read('pages/Dashboard.tsx')).not.toContain('dashboard:catalogue-progress')
    expect(read('pages/Insights.tsx')).toContain('<ObservatoryTotals />')
    expect(read('components/insights/ObservatoryTotals.tsx')).toContain("'dashboard:stats'")
  })

  it('[UX-006] Given a part of Home or the Insights trends that cannot be read, When the page is drawn, Then it says so with a retry and the other parts still show', () => {
    const home = read('pages/Dashboard.tsx')
    expect(home).toContain('Could not work out the next actions.')
    expect(home).toContain('Could not work out the coming nights.')
    expect(home).toContain('Could not look through your files.')
    expect(home.match(/\(null\); void load\w+\(\) }}>Try again/g)).toHaveLength(3)
    const insights = read('pages/Insights.tsx')
    // The totals sit before the loading and failure branch, so a trends failure never hides them.
    expect(insights.indexOf('<ObservatoryTotals />')).toBeLessThan(insights.indexOf('Could not read the seeing, filter and activity trends.'))
  })

  it('[UX-007] Given Home left open, When a queued stack starts, finishes or is cancelled, Then the suggestions are read again so the line follows the job', () => {
    const home = read('pages/Dashboard.tsx')
    expect(home).toMatch(/setInterval\(\(\) => void loadRecommendations\(\), REFRESH_MS\)/)
    expect(home).toContain('clearInterval(timer)')
  })

  it('[UX-007] Given a target with a stack queued for the run window, When Home lists it, Then the suggestion says so and opens Jobs', () => {
    const [marked] = withQueuedJobs([rec({})], [job({})])
    expect(marked).toMatchObject({ queued: 'Queued in Jobs for the run window.', actionLabel: 'Open Jobs', actionTo: '/jobs' })
    const [restack] = withQueuedJobs([rec({ id: 'restack:t-m31', priority: 'medium' })], [job({ timing: 'now' })])
    expect(restack.queued).toBe('Queued in Jobs to run as soon as it can.')
  })

  it('[UX-007] Given a stack running and another queued for the same target, When Home lists it, Then it says it is stacking now', () => {
    const [marked] = withQueuedJobs([rec({})], [job({}), job({ state: 'running' }), job({})])
    expect(marked.queued).toBe('Stacking now. The live log is in Jobs.')
  })

  it('[UX-007] Given finished jobs, post-processing jobs, other targets and captures, When Home lists them, Then nothing is marked', () => {
    const recs = [rec({}), rec({ id: 'capture:t-m31', category: 'capture' }), rec({ id: 'ready-to-stack:t-m42', targetId: 't-m42' })]
    const jobs = [
      job({ state: 'succeeded' }),
      job({ state: 'failed' }),
      job({ state: 'cancelled' }),
      job({ kind: 'post-process' }),
      job({ targetId: 't-m101' })
    ]
    expect(withQueuedJobs(recs, jobs)).toEqual(recs)
    // The capture for a target with a queued stack is still a capture to do tonight.
    expect(withQueuedJobs([recs[1]], [job({})])).toEqual([recs[1]])
  })

  it('[UX-008] Given Home, Jobs and the cockpit cards, When they are drawn, Then every card and empty state comes from the shared components', () => {
    const files = [
      'pages/Dashboard.tsx',
      'pages/Jobs.tsx',
      'components/cockpit/ComingNightsCard.tsx',
      'components/cockpit/HiddenDataCard.tsx',
      'components/insights/ObservatoryTotals.tsx'
    ]
    for (const file of files) {
      const source = read(file)
      expect(source, file).toMatch(/<Card\b/)
      // No hand-drawn card: a surface panel with its own uppercase heading.
      expect(source, file).not.toMatch(/rounded-lg p-4/)
      expect(source, file).not.toMatch(/<h2\b/)
    }
  })
})
