import { describe, it, expect } from 'vitest'
import { makePrepareSirilWorkspace } from '@astro/application'
import { InMemorySirilWorkspace } from '@astro/testkit'

describe('PrepareSirilWorkspace', () => {
  it('[ING-013] Given a folder of lights, darks and flats, When prepared for Siril, Then each lands in its folder in the work area', async () => {
    const workspace = new InMemorySirilWorkspace().addSource(
      '/data/M 81',
      { name: 'Light_001.fit' }, { name: 'Light_002.fit' }, { name: 'd1.fit', imageType: 'Dark Frame' }, { name: 'Flat_1.fit' }
    )
    const result = await makePrepareSirilWorkspace({ workspace })('/data/M 81', '/work/siril/M 81')

    expect(result).toEqual({
      workDir: '/work/siril/M 81', linked: 4, copied: 0, existing: 0,
      byFolder: { lights: 2, darks: 1, flats: 1, biases: 0 }
    })
    expect([...workspace.folders].sort()).toEqual(['/work/siril/M 81/biases', '/work/siril/M 81/darks', '/work/siril/M 81/flats', '/work/siril/M 81/lights'])
    expect(workspace.placed.get('/work/siril/M 81/darks/d1.fit')).toBe('/data/M 81/d1.fit')
  })

  it('[ING-013] Given frames on another volume, When prepared, Then they are copied, and a second run leaves existing frames alone', async () => {
    const workspace = new InMemorySirilWorkspace().addSource('/nas/M 1', { name: 'Light_001.fit' })
    workspace.otherVolume.add('/nas/M 1/Light_001.fit')
    const prepare = makePrepareSirilWorkspace({ workspace })
    expect((await prepare('/nas/M 1', '/work/M 1')).copied).toBe(1)
    expect((await prepare('/nas/M 1', '/work/M 1')).existing).toBe(1)
  })

  it('[ING-001] Given a source folder, When prepared for Siril, Then its listing is unchanged and every write is under the work area', async () => {
    const workspace = new InMemorySirilWorkspace().addSource('/data/M 81', { name: 'Light_001.fit' }, { name: 'Bias_1.fit' })
    const before = structuredClone(workspace.source.get('/data/M 81'))
    await makePrepareSirilWorkspace({ workspace })('/data/M 81', '/work/M 81')
    expect(workspace.source.get('/data/M 81')).toEqual(before)
    expect([...workspace.placed.keys()].every(p => p.startsWith('/work/M 81/'))).toBe(true)
  })
})
