import os from 'os'
import type { MemoryProbe } from '@astro/application'
import type { MachineMemory } from '@astro/domain'

/**
 * MemoryProbe over Node's view of the machine. os.freemem() is what the system can hand a new
 * program: on Windows the available physical memory (standby cache included), on Linux
 * MemAvailable, so reclaimable cache counts as free on both.
 */
export class NodeMemoryProbe implements MemoryProbe {
  async read(): Promise<MachineMemory | null> {
    const totalBytes = os.totalmem()
    const availableBytes = os.freemem()
    return totalBytes > 0 ? { totalBytes, availableBytes } : null
  }
}
