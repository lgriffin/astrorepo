import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { archiveSpace, freedBytes, namedFrames, parseStackManifest, planSirilWorkspace, stackManifest, type WorkAreaFile } from '@astro/domain'
import { anyText, fileStem, instant, propertyParams } from './arbitraries'

const FOLDERS = ['lights', 'darks', 'flats', 'biases', 'process', 'masters']

/** A work folder's files: some hard links sharing an inode across folders, some symbolic links. */
const workFiles: fc.Arbitrary<WorkAreaFile[]> = fc
  .array(
    fc.record({
      folder: fc.constantFrom(...FOLDERS),
      name: fileStem,
      inode: fc.integer({ min: 0, max: 8 }),
      links: fc.integer({ min: 1, max: 3 }),
      symlink: fc.boolean(),
      known: fc.boolean()
    }),
    { maxLength: 25 }
  )
  .map(list =>
    list.map((f, i) => ({
      path: `${f.folder}/${i}-${f.name}`,
      // One inode is one file: every name of it has its size and link count.
      sizeBytes: 1000 * (f.inode + 1),
      links: f.links,
      fileId: f.known ? `ino${f.inode}` : null,
      symlink: f.symlink
    }))
  )

describe('space an archive frees', () => {
  it('[ARC-002, FUZ-006] Given any work folder, When folders are chosen for removal, Then choosing more never frees less, and nothing frees more than the files in them take', () => {
    fc.assert(
      fc.property(workFiles, fc.subarray(FOLDERS), fc.subarray(FOLDERS), (files, some, more) => {
        const chosen = [...new Set([...some, ...more])]
        expect(freedBytes(files, chosen)).toBeGreaterThanOrEqual(freedBytes(files, some))
        const inChosen = files.filter(f => chosen.includes(f.path.split('/')[0]) && !f.symlink)
        expect(freedBytes(files, chosen)).toBeLessThanOrEqual(inChosen.reduce((n, f) => n + f.sizeBytes, 0))
        expect(freedBytes(files, [])).toBe(0)
      }),
      propertyParams()
    )
  })

  it('[ARC-007, FUZ-006] Given any copy and free space, When the archive\'s space is checked, Then it fits exactly when the copy is no larger, and the shortfall makes up the difference', () => {
    fc.assert(
      fc.property(fc.nat({ max: 2 ** 45 }), fc.option(fc.nat({ max: 2 ** 45 }), { nil: null }), (copy, free) => {
        const s = archiveSpace(copy, free)
        if (free === null) expect(s.verdict).toBe('unknown')
        else if (copy <= free) expect(s).toEqual({ verdict: 'fits', shortBytes: 0 })
        else expect(s).toEqual({ verdict: 'short', shortBytes: copy - free })
      }),
      propertyParams()
    )
  })
})

describe('stack manifests', () => {
  it('[PRV-001, ARC-003, FUZ-006] Given any stack, When its manifest is written as JSON and read back, Then it reads as the same manifest and names every frame laid out, with its source', () => {
    const frame = fc.record({ path: fc.tuple(fileStem, fileStem).map(([d, n]) => `/src/${d}/${n}`), name: fc.tuple(fc.constantFrom('Light_', 'Dark_', 'Flat_', 'Bias_'), fileStem).map(([a, b]) => `${a}${b}.fit`), imageType: fc.constant(null) })
    fc.assert(
      fc.property(fc.array(frame, { maxLength: 15 }), fc.option(anyText, { nil: null }), instant, fc.array(fileStem, { maxLength: 3 }), (frames, targetName, finishedAt, rejected) => {
        const placements = planSirilWorkspace(frames)
        const manifest = stackManifest({
          result: { path: '/w/result_3600s.fit', sizeBytes: 10, modifiedAt: null },
          target: { id: 't', name: targetName },
          job: { id: 'j', title: 'Stack', startedAt: null },
          finishedAt,
          program: 'siril-cli',
          script: '/scripts/OSC_Preprocessing.ssf',
          steps: [],
          placements,
          rejected
        })
        const back = parseStackManifest(JSON.stringify(manifest))
        expect(back).toEqual(manifest)
        const named = namedFrames([{ path: 'result_3600s.fit.astrorepo.json', manifest: back! }])
        expect(named.map(f => `${f.folder}/${f.name}<${f.source}`).sort()).toEqual(placements.map(p => `${p.folder}/${p.name}<${p.from}`).sort())
      }),
      propertyParams()
    )
  })
})
