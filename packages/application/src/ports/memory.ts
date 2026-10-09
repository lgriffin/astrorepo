import type { MachineMemory } from '@astro/domain'

/** Driven port: how much memory the PC has, and how much is free right now. */
export interface MemoryProbe {
  /** Null when the system will not say. */
  read(): Promise<MachineMemory | null>
}
