import { describe, it, expect } from 'vitest'
import { makeDiscoverTarget, makeDiscoverTargets } from '@astro/application'
import { InMemoryFrameCatalogue, subs, stackAt, target } from '@astro/testkit'

function catalogue() {
  return new InMemoryFrameCatalogue()
    .add(target('M 81', { subs: subs(2952, 10, '2026-03-01T21:00:00Z', { filter: 'IRCUT', scope: 'Seestar S50' }) }))
    .add(target('M 42', { subs: subs(100, 10, '2026-01-01T21:00:00Z'), stacks: [stackAt('2026-01-02T09:00:00Z')] }))
    .add(target('M 31', { goalSec: 21600 }))
    .add(target('M 45', { subs: subs(10, 10, '2026-01-01T21:00:00Z') }))
    .add(target('M 1', { finalCount: 1 }))
}

describe('DiscoverTargets', () => {
  it('[DSC-001] Given indexed targets, When the cockpit is opened, Then each target comes back with its breakdown, sorted by name', async () => {
    const { targets } = await makeDiscoverTargets({ frames: catalogue() })()
    expect(targets.map(t => t.targetName)).toEqual(['M 1', 'M 31', 'M 42', 'M 45', 'M 81'])
    const m81 = targets.find(t => t.targetName === 'M 81')!
    expect(m81.byScope).toEqual([{ key: 'Seestar S50', integrationSec: 29520, subCount: 2952 }])
    expect(m81.stackCount).toBe(0)
  })

  it('[DSC-009] Given targets at different stages, When the cockpit is opened, Then it counts targets per derived progress state in pipeline order', async () => {
    const { progress } = await makeDiscoverTargets({ frames: catalogue() })()
    expect(progress).toEqual([
      { state: 'planned', count: 1 },
      { state: 'capturing', count: 1 },
      { state: 'enough-data', count: 1 },
      { state: 'stacked', count: 1 },
      { state: 'processed', count: 0 },
      { state: 'final', count: 1 }
    ])
  })

  it('[DSC-001] Given one target id, When the target page is opened, Then only that target is discovered', async () => {
    const d = await makeDiscoverTarget({ frames: catalogue() })('target-m-42')
    expect(d?.targetName).toBe('M 42')
    expect(d?.progress).toBe('stacked')
  })

  it('[DSC-001] Given an id with no data, When the target page is opened, Then nothing is discovered', async () => {
    expect(await makeDiscoverTarget({ frames: catalogue() })('target-unknown')).toBeNull()
  })

  it('[DSC-009] Given a custom policy, When discovered, Then its threshold decides enough data', async () => {
    const frames = new InMemoryFrameCatalogue().add(target('M 45', { subs: subs(10, 10, '2026-01-01T21:00:00Z') }))
    const policy = { readyToStackSec: 60, restackSec: 60 }
    expect((await makeDiscoverTargets({ frames }, policy)()).targets[0].progress).toBe('enough-data')
    expect((await makeDiscoverTarget({ frames }, policy)('target-m-45'))?.progress).toBe('enough-data')
  })
})
