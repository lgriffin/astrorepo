import type { CompanionScreen } from '@astro/domain'
import type { CompanionDevice, CompanionDeviceStore, CompanionSecrets } from '@astro/application'

export class InMemoryCompanionStore implements CompanionDeviceStore {
  private readonly devices: CompanionDevice[] = []

  async listCompanions(): Promise<CompanionDevice[]> {
    return [...this.devices]
      .sort((a, b) => a.pairedAt.getTime() - b.pairedAt.getTime() || a.id.localeCompare(b.id))
      .map(d => structuredClone(d))
  }

  async companionByKeyHash(keyHash: string): Promise<CompanionDevice | null> {
    const found = this.devices.find(d => d.keyHash === keyHash)
    return found ? structuredClone(found) : null
  }

  async addCompanion(device: CompanionDevice): Promise<void> {
    this.devices.push(structuredClone(device))
  }

  async removeCompanion(id: string): Promise<boolean> {
    const at = this.devices.findIndex(d => d.id === id)
    if (at < 0) return false
    this.devices.splice(at, 1)
    return true
  }

  async setCompanionScreen(id: string, screen: CompanionScreen): Promise<boolean> {
    const found = this.devices.find(d => d.id === id)
    if (!found) return false
    found.screen = screen
    return true
  }

  async markCompanionSeen(id: string, at: Date): Promise<void> {
    const found = this.devices.find(d => d.id === id)
    if (found) found.lastSeenAt = new Date(at)
  }
}

/** Secrets a test can predict: secret-1, secret-2…, codes from a list (then 100000, 100001…), and hash = "hash:" + key. */
export class FakeCompanionSecrets implements CompanionSecrets {
  private secrets = 0
  private codes = 0

  constructor(private readonly queuedCodes: string[] = []) {}

  newSecret(): string {
    return `secret-${++this.secrets}`
  }

  newCode(): string {
    return this.queuedCodes.shift() ?? String(100000 + this.codes++)
  }

  hashKey(key: string): string {
    return `hash:${key}`
  }
}
