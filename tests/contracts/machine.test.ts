import { FixedClock, FixedMemory } from '@astro/testkit'
import { clockContract } from '@astro/testkit/contracts/clock.contract'
import { memoryProbeContract } from '@astro/testkit/contracts/memory.contract'
import { NodeMemoryProbe } from '../../src/main/adapters/node-memory-probe'
import { systemClock } from '../../src/main/adapters/system-clock'

memoryProbeContract('fixed', { live: () => new FixedMemory(), silent: () => new FixedMemory(null) })
memoryProbeContract('Node', { live: () => new NodeMemoryProbe(), silent: () => new NodeMemoryProbe({ totalmem: () => 0, freemem: () => 0 }) })

clockContract('fixed', () => {
  const clock = new FixedClock()
  return { clock, pass: async ms => clock.set(new Date(clock.now().getTime() + ms).toISOString()) }
})
clockContract('system', () => ({ clock: systemClock, pass: ms => new Promise(resolve => setTimeout(resolve, ms)) }))
