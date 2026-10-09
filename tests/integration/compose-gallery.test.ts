import Database from 'better-sqlite3'
import type { Worker } from 'worker_threads'
import { describe, expect, it } from 'vitest'
import { composeGallery, inspectOnWorkers } from '../../src/main/composition'
import { runMigrations } from '../../src/main/db/migrations'

describe('Composing the gallery', () => {
  it('[INS-010] Given one database, When the gallery is composed for each request, Then it is the same one, so its catalogue is read once; a new handle or pixel reader composes it afresh', async () => {
    const db = new Database(':memory:')
    runMigrations(db)
    const first = composeGallery(db)
    expect(composeGallery(db)).toBe(first)
    const other = new Database(':memory:')
    runMigrations(other)
    expect(composeGallery(other)).not.toBe(first)
    const onOther = composeGallery(other)
    const pixels = inspectOnWorkers(() => ({}) as Worker)
    expect(composeGallery(other)).not.toBe(onOther)
    await pixels.dispose()
    db.close()
    other.close()
  })
})
