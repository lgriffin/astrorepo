import crypto from 'crypto'
import type { CompanionSecrets } from '@astro/application'

/** CompanionSecrets from Node's crypto: 256-bit secrets, uniform six-digit codes, SHA-256 key hashes. */
export const nodeCompanionSecrets: CompanionSecrets = {
  newSecret: () => crypto.randomBytes(32).toString('base64url'),
  newCode: () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0'),
  hashKey: key => crypto.createHash('sha256').update(key).digest('hex')
}
