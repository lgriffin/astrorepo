import type { CompanionScreen } from '@astro/domain'

/** A screen paired with this PC. Its key is never kept, only the key's hash. */
export interface CompanionDevice {
  id: string
  name: string
  keyHash: string
  screen: CompanionScreen
  pairedAt: Date
  lastSeenAt: Date | null
}

/** Driven port: the companions paired with this PC. */
export interface CompanionDeviceStore {
  /** Every paired companion, oldest pairing first. */
  listCompanions(): Promise<CompanionDevice[]>
  companionByKeyHash(keyHash: string): Promise<CompanionDevice | null>
  addCompanion(device: CompanionDevice): Promise<void>
  /** False when no companion has that id. */
  removeCompanion(id: string): Promise<boolean>
  /** False when no companion has that id. */
  setCompanionScreen(id: string, screen: CompanionScreen): Promise<boolean>
  markCompanionSeen(id: string, at: Date): Promise<void>
}

/** Driven port: the randomness and hashing pairing needs. */
export interface CompanionSecrets {
  /** An id or key that cannot be guessed (at least 128 random bits), as text. */
  newSecret(): string
  /** A pairing code of six random digits. */
  newCode(): string
  /** A one-way hash of a key, the same for the same key. */
  hashKey(key: string): string
}
