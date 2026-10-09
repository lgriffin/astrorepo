import { afterEach } from 'vitest'
import { InMemoryCometStore } from '@astro/testkit'
import { cometStoreContract } from '@astro/testkit/contracts/comet-store.contract'
import { SqliteCometStore } from '../../src/main/adapters/sqlite-comet-store'
import { seedTarget, setupTestDb, teardownTestDb } from '../helpers/setup'

afterEach(() => teardownTestDb())

cometStoreContract('in-memory', () => new InMemoryCometStore(), n => `target-${n}`)

cometStoreContract(
  'SQLite',
  () => {
    const db = setupTestDb()
    seedTarget(db, { id: 'target-1', canonicalName: 'C/2023 A3' })
    seedTarget(db, { id: 'target-2', canonicalName: '12P/Pons-Brooks' })
    return new SqliteCometStore(db)
  },
  n => `target-${n}`
)
