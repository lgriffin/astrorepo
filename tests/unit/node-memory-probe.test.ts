import { describe, expect, it } from 'vitest'
import { NodeMemoryProbe } from '../../src/main/adapters/node-memory-probe'

describe('NodeMemoryProbe', () => {
  it('[ADV-002] Given this machine, When its memory is read, Then the total is positive and no more is free than exists', async () => {
    const m = await new NodeMemoryProbe().read()
    expect(m?.totalBytes).toBeGreaterThan(0)
    expect(m?.availableBytes).toBeLessThanOrEqual(m?.totalBytes ?? 0)
  })
})
