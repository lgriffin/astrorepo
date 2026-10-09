import os from 'os'
import type { MemoryProbe } from '@astro/application'
import type { MachineMemory } from '@astro/domain'

/** MemoryProbe over Node's view of the machine. */
export class NodeMemoryProbe implements MemoryProbe {
  async read(): Promise<MachineMemory | null> {
    const totalBytes = os.totalmem()
    const availableBytes = os.freemem()
    return totalBytes > 0 ? { totalBytes, availableBytes } : null
  }
}
