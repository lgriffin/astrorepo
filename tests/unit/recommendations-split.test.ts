import { describe, it, expect } from 'vitest'
import { splitRecommendations } from '../../src/shared/recommendations'
import type { Recommendation } from '../../src/shared/types'

const rec = (id: string, category: Recommendation['category']): Recommendation => ({
  id,
  category,
  priority: 'high',
  title: id,
  description: '',
  targetId: null,
  targetName: null,
  actionLabel: null
})

describe('dashboard recommendations', () => {
  it('[DSC-018] Given ten ranked actions and a missing-darks warning, When split, Then the warning is a check of its own and the actions keep their order', () => {
    const actions = Array.from({ length: 10 }, (_, i) => rec(`action-${i}`, i < 4 ? 'capture' : 'stacking'))
    const { nextActions, otherChecks } = splitRecommendations([...actions, rec('missing-darks', 'calibration'), rec('goal', 'integration')])
    expect(nextActions.map(r => r.id)).toEqual(actions.map(r => r.id))
    expect(otherChecks.map(r => r.id)).toEqual(['missing-darks', 'goal'])
  })
})
