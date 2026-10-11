import type { MemoryProbe } from '@astro/application'
import type { MachineMemory } from '@astro/domain'

/** The PC's memory as the test sets it; null when the system will not say. */
export class FixedMemory implements MemoryProbe {
  constructor(public memory: MachineMemory | null = { totalBytes: 32 * 1024 ** 3, availableBytes: 12 * 1024 ** 3 }) {}

  async read(): Promise<MachineMemory | null> {
    return this.memory && { ...this.memory }
  }
}
