import { describe, expect, it } from 'vitest'
import type { FilterForecast, MosaicIntegration, TargetIntegration } from '@astro/application'
import { forecastGain, rankExposure, summarise, timeToGoal, type ForecastFrame } from '@astro/domain'
import { toForecastView, toIntegrationView, toMosaicIntegrationView } from '../../src/main/adapters/forecast-presenter'

const H = 3600
const frames = (n: number, over: Partial<ForecastFrame> = {}): ForecastFrame[] => Array.from({ length: n }, () => ({ seconds: 300, filter: 'Ha', accepted: true, snr: null, ...over }))
// 12 frames of 300 s, 9 kept: 1 h acquired, 45 min accepted.
const ha = summarise([...frames(9), ...frames(3, { accepted: false })], 'Ha')
const filter = (goalSec: number | null, summary = ha): FilterForecast => ({
  summary,
  goalSec,
  toGoal: goalSec === null ? null : timeToGoal(summary, goalSec),
  forecasts: [forecastGain(summary, H)]
})

describe('forecast presenter', () => {
  it('[AI-002, AI-003] Given forecasts, When shown, Then the gain and its range are percentages, and insufficient data shows no number', () => {
    expect(toForecastView(forecastGain(ha, H))).toEqual({ added: '1 h', gain: '+41%', range: expect.stringMatching(/^\+\d+% to \+\d+%$/), kind: 'theoretical', evidence: expect.stringMatching(/^Model sqrt-v1, from 12 frames \(9 accepted\)\. Signal to noise grows/) })
    expect(toForecastView(forecastGain(summarise([]), 1800))).toMatchObject({ added: '30 min', gain: null, range: null, kind: 'insufficient data', evidence: expect.stringMatching(/^Model sqrt-v1, from 0 frames \(0 accepted\)\./) })
    expect(toForecastView(forecastGain(summarise(frames(12, { snr: 10 })), H)).evidence).toMatch(/^Model sqrt-v1, from 12 frames \(12 accepted, 12 measured\)\./)
  })

  it('[AI-001, AI-005] Given a target, When shown, Then acquired, accepted and rejected stand apart and each goal says how much capture it still takes', () => {
    const empty = summarise([], 'SII')
    const t: TargetIntegration = {
      targetId: 'm31',
      all: summarise([...frames(9), ...frames(3, { accepted: false })]),
      filters: [filter(2 * H), filter(1800), filter(H, empty), filter(null)],
      best: rankExposure([{ id: 'Ha', label: 'Ha', summary: ha }])
    }
    const v = toIntegrationView(t, [60])
    expect(v.total).toMatchObject({ filter: 'All filters', frames: '12 frames, 3 rejected', acquired: '1 h', accepted: '45 min', rejection: '25% rejected', goal: null, toGoal: null })
    expect(v.total.forecasts).toHaveLength(1)
    expect(v.filters.map(f => [f.filter, f.goal, f.toGoal])).toEqual([
      ['Ha', '2 h', expect.stringMatching(/^About 1 h 40 min more capture \(\d+ h( \d+ min)? to \d+ h( \d+ min)?\)$/)],
      ['Ha', '30 min', 'Goal met'],
      ['SII', '1 h', '1 h short, and nothing accepted yet to say how much capture that takes'],
      ['Ha', null, null]
    ])
    expect(v.filters[2]).toMatchObject({ frames: '0 frames', acquired: 'none', accepted: 'none', rejection: null })
    expect(v.weighted).toBeNull()
    expect(v.best).toEqual([{ label: 'Ha', gain: '+41%', kind: 'theoretical' }])
    expect(v.assumptions).toHaveLength(4)
    expect(v.basis).toBe('Model sqrt-v1, from 12 frames.')
  })

  it('[AI-007] Given measured frames, When shown, Then the weighted equivalent and how many were measured are said', () => {
    const all = summarise(frames(12, { snr: 10 }))
    const v = toIntegrationView({ targetId: 'm31', all, filters: [], best: [] }, [])
    expect(v.weighted).toBe('Equivalent to 1 h of the median frame')
    expect(v.basis).toBe('Model sqrt-v1, from 12 frames (12 measured).')
    expect(toIntegrationView({ targetId: 'm31', all: summarise(frames(1)), filters: [], best: [] }, []).basis).toBe('Model sqrt-v1, from 1 frame.')
  })

  it('[AI-002, AI-003] Given a mosaic, When shown, Then each panel has its filters and the assumptions quote every panel together, or say there is none', () => {
    const m: MosaicIntegration = {
      workspaceId: 'w1',
      revision: 1,
      panels: [
        { panelId: 'R1C1', all: summarise(frames(2, { accepted: false })), filters: [filter(H, summarise([], 'Ha'))] },
        { panelId: 'R1C2', all: ha, filters: [filter(H)] }
      ],
      best: rankExposure([{ id: 'R1C2|Ha', label: 'R1C2 Ha', summary: ha }])
    }
    const v = toMosaicIntegrationView(m)
    expect(v.panels.map(p => [p.panelId, p.filters.map(f => f.filter)])).toEqual([
      ['R1C1', ['Ha']],
      ['R1C2', ['Ha']]
    ])
    expect(v.best).toEqual([{ label: 'R1C2 Ha', gain: '+41%', kind: 'theoretical' }])
    expect(v.assumptions[0]).toMatch(/^Signal to noise grows/)
    expect(v.assumptions).toContain('New capture is accepted at the rate so far: 64% of 14 frames.')
    expect(v.assumptions.at(-1)).toBe("That rate is the whole mosaic's; each panel's forecast uses its own.")
    expect(v.basis).toBe('Model sqrt-v1, from 14 frames counted on the panels.')
    expect(toMosaicIntegrationView({ ...m, panels: [{ ...m.panels[0], all: summarise([]) }] }).assumptions).toEqual(['Nothing counted on any panel yet, so there is nothing to improve on.'])
  })
})
