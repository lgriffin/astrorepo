import { describe, it, expect } from 'vitest'
import type { CompanionSecrets } from '@astro/application'

/** Every CompanionSecrets adapter must pass this suite. */
export function companionSecretsContract(adapterName: string, make: () => CompanionSecrets): void {
  describe(`CompanionSecrets contract: ${adapterName}`, () => {
    it('[PI-018] Given many secrets made, When compared, Then none is empty and no two are the same', () => {
      const secrets = make()
      const made = Array.from({ length: 50 }, () => secrets.newSecret())
      expect(made.every(s => s.length > 0)).toBe(true)
      expect(new Set(made).size).toBe(50)
    })

    it('[PI-018] Given a pairing code made, When read, Then it is six digits', () => {
      const secrets = make()
      for (let i = 0; i < 50; i++) expect(secrets.newCode()).toMatch(/^\d{6}$/)
    })

    it('[PI-018] Given a key, When it is hashed, Then the hash is the same each time, differs from the key, and differs for another key', () => {
      const secrets = make()
      const key = secrets.newSecret()
      const other = secrets.newSecret()
      expect(secrets.hashKey(key)).toBe(secrets.hashKey(key))
      expect(secrets.hashKey(key)).not.toBe(key)
      expect(secrets.hashKey(key)).not.toBe(secrets.hashKey(other))
    })
  })
}
