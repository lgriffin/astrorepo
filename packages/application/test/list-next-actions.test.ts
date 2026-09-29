import { describe, it, expect } from 'vitest'
import { makeListNextActions, makeListStackingSuggestions, makePlanForward } from '@astro/application'
import {
  FakeEphemeris,
  FixedClock,
  InMemoryDismissalStore,
  InMemoryFrameCatalogue,
  InMemoryPlanningSettings,
  InMemoryTargetPositions,
  subs,
  target
} from '@astro/testkit'

function setup(site: { latitudeDeg: number; longitudeDeg: number; elevationM: number } | null) {
  const frames = new InMemoryFrameCatalogue()
    .add(target('M 42', { subs: subs(36, 300, '2026-02-01T20:00:00Z') }))
    .add(target('M 31', { subs: subs(12, 300, '2026-09-20T21:00:00Z'), goalSec: 36000 }))
  const positions = new InMemoryTargetPositions()
    .add({ targetId: 'target-m-42', raHours: 5.59, decDeg: -5.39, objectType: 'emission_nebula' })
    .add({ targetId: 'target-m-31', raHours: 0.71, decDeg: 41.27, objectType: 'galaxy' })
  const planForward = makePlanForward({
    frames,
    positions,
    settings: new InMemoryPlanningSettings(site),
    ephemeris: new FakeEphemeris(),
    clock: new FixedClock(new Date('2026-09-29T15:00:00Z'))
  })
  const listStackingSuggestions = makeListStackingSuggestions({ frames, dismissals: new InMemoryDismissalStore() })
  return { planForward, listStackingSuggestions }
}

describe('ListNextActions', () => {
  it('[DSC-007] Given a site and targets, When next actions are listed, Then tonight’s capture comes before stacking', async () => {
    const deps = setup({ latitudeDeg: 51.5, longitudeDeg: -0.13, elevationM: 0 })
    const actions = await makeListNextActions(deps)()
    expect(actions.map(a => (a.kind === 'capture' ? `shoot ${a.targetName}` : `stack ${a.suggestion.targetName}`))).toEqual([
      'shoot M 31',
      'stack M 42'
    ])
    const [m31] = actions
    expect(m31.kind === 'capture' && m31.shortOfGoalSec).toBe(36000 - 3600)
  })

  it('[DSC-017] Given no site, When next actions are listed, Then the stacking suggestions still come back', async () => {
    const actions = await makeListNextActions(setup(null))()
    expect(actions.map(a => a.kind)).toEqual(['stack'])
  })

  it('[DSC-017] Given planning that fails, When next actions are listed, Then the stacking suggestions still come back', async () => {
    const { listStackingSuggestions } = setup(null)
    const actions = await makeListNextActions({ listStackingSuggestions, planForward: () => Promise.reject(new Error('ephemeris down')) })()
    expect(actions.map(a => a.kind)).toEqual(['stack'])
  })
})
