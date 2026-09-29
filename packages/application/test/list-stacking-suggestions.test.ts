import { describe, it, expect } from 'vitest'
import { makeListStackingSuggestions } from '@astro/application'
import { InMemoryDismissalStore, InMemoryFrameCatalogue, subs, stackAt, target } from '@astro/testkit'

describe('ListStackingSuggestions', () => {
  it('[DSC-011] Given several targets with unprocessed data, When suggestions are listed, Then the most unprocessed integration comes first', async () => {
    const frames = new InMemoryFrameCatalogue()
      .add(target('M 51', { subs: subs(1080, 10, '2026-03-01T21:00:00Z') }))                  // 3 h, never stacked
      .add(target('M 81', { subs: subs(2952, 10, '2026-03-01T21:00:00Z') }))                  // 8 h 12 m, never stacked
      .add(target('M 101', {                                                                  // 4 h added since stack
        subs: subs(1440, 10, '2026-03-10T21:00:00Z'),
        stacks: [stackAt('2026-02-15T12:00:00Z')]
      }))

    const suggestions = await makeListStackingSuggestions({ frames, dismissals: new InMemoryDismissalStore() })()

    expect(suggestions.map(s => [s.targetName, s.kind])).toEqual([
      ['M 81', 'ready-to-stack'],
      ['M 101', 'restack'],
      ['M 51', 'ready-to-stack']
    ])
  })

  it('[DSC-010] Given targets below the threshold or already stacked, When suggestions are listed, Then only the ready target is suggested', async () => {
    const frames = new InMemoryFrameCatalogue()
      .add(target('M 1', { subs: subs(100, 10, '2026-03-01T21:00:00Z') }))
      .add(target('M 42', { subs: subs(2000, 10, '2026-01-01T21:00:00Z'), stacks: [stackAt('2026-02-01T12:00:00Z')] }))
      .add(target('M 33', { subs: subs(900, 10, '2026-03-01T21:00:00Z') }))

    const suggestions = await makeListStackingSuggestions({ frames, dismissals: new InMemoryDismissalStore() })()

    expect(suggestions.map(s => s.targetName)).toEqual(['M 33'])
  })

  it('[DSC-010] Given a custom policy, When suggestions are listed, Then its threshold is used', async () => {
    const frames = new InMemoryFrameCatalogue().add(target('M 1', { subs: subs(360, 10, '2026-03-01T21:00:00Z') }))
    const suggestions = await makeListStackingSuggestions({ frames, dismissals: new InMemoryDismissalStore() }, { readyToStackSec: 3600, restackSec: 3600 })()
    expect(suggestions).toHaveLength(1)
  })
})
