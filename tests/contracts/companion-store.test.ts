import { afterEach } from 'vitest'
import { FakeCompanionSecrets, InMemoryCompanionStore } from '@astro/testkit'
import { companionStoreContract } from '@astro/testkit/contracts/companion-store.contract'
import { companionSecretsContract } from '@astro/testkit/contracts/companion-secrets.contract'
import { nodeCompanionSecrets } from '../../src/main/adapters/node-companion-secrets'
import { SqliteCompanionStore } from '../../src/main/adapters/sqlite-companion-store'
import { setupTestDb, teardownTestDb } from '../helpers/setup'

companionStoreContract('in-memory', () => new InMemoryCompanionStore())

afterEach(() => teardownTestDb())
companionStoreContract('SQLite', () => new SqliteCompanionStore(setupTestDb()))

companionSecretsContract('fake', () => new FakeCompanionSecrets())
companionSecretsContract('Node crypto', () => nodeCompanionSecrets)
