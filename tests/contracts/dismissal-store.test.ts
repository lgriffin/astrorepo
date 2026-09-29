import { afterEach } from 'vitest'
import { InMemoryDismissalStore } from '@astro/testkit'
import { dismissalStoreContract } from '@astro/testkit/contracts/dismissal-store.contract'
import { SqliteDismissalStore } from '../../src/main/adapters/sqlite-dismissal-store'
import { setupTestDb, teardownTestDb } from '../helpers/setup'

dismissalStoreContract('in-memory', () => new InMemoryDismissalStore())

afterEach(() => teardownTestDb())
dismissalStoreContract('SQLite', () => new SqliteDismissalStore(setupTestDb()))
