import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { duplicateCandidates, groupDuplicates, planRescan, planSirilWorkspace, sirilFolderFor, type FileHash } from '@astro/domain'
import { fileStem, propertyParams, withPermutation } from './arbitraries'

/**
 * Files with unique paths whose content is one of a few blobs: equal content gives an equal size,
 * quick key and full hash, as it does on disk. Some files are not hashed in full yet.
 */
const files = fc
  .uniqueArray(
    fc.record({
      path: fc.integer({ min: 0, max: 400 }).map(n => `/lib/f${n}.fit`),
      content: fc.integer({ min: 0, max: 5 }),
      hashed: fc.boolean()
    }),
    { selector: f => f.path, maxLength: 30 }
  )
  .map(list =>
    list.map((f): FileHash => ({
      path: f.path,
      sizeBytes: 1000 + (f.content % 3) * 10,
      modifiedAt: '2026-03-01T09:00:00.000Z',
      // Contents 0 and 3 share a size and sampled bytes but differ: the sample only narrows the search.
      quickKey: f.content % 3 === 0 ? 'q0' : `q${f.content}`,
      fullHash: f.hashed ? `sha256:${f.content}` : null
    }))
  )

describe('duplicate groups', () => {
  it('[ING-003, FUZ-006] Given any indexed files, When duplicates are grouped, Then the groups are disjoint, each holds two or more paths of one hash, and every hash held twice has a group', () => {
    fc.assert(
      fc.property(files, list => {
        const report = groupDuplicates(list)
        const seen = new Set<string>()
        for (const g of report.groups) {
          expect(g.paths.length).toBeGreaterThan(1)
          for (const p of g.paths) {
            expect(seen.has(p)).toBe(false)
            seen.add(p)
            expect(list.find(f => f.path === p)?.fullHash).toBe(g.contentHash)
          }
        }
        const counts = new Map<string, number>()
        for (const f of list) if (f.fullHash) counts.set(f.fullHash, (counts.get(f.fullHash) ?? 0) + 1)
        expect(report.groups.map(g => g.contentHash).sort()).toEqual([...counts].filter(([, n]) => n > 1).map(([h]) => h).sort())
      }),
      propertyParams()
    )
  })

  it('[ING-003, FUZ-006] Given any indexed files, When grouped, Then the copies and reclaimable bytes are the sums over the groups, and biggest savings come first', () => {
    fc.assert(
      fc.property(files, list => {
        const report = groupDuplicates(list)
        expect(report.duplicateFiles).toBe(report.groups.reduce((n, g) => n + g.paths.length - 1, 0))
        expect(report.reclaimableBytes).toBe(report.groups.reduce((n, g) => n + g.sizeBytes * (g.paths.length - 1), 0))
        const savings = report.groups.map(g => g.sizeBytes * (g.paths.length - 1))
        expect(savings).toEqual([...savings].sort((a, b) => b - a))
      }),
      propertyParams()
    )
  })

  it('[ING-003, FUZ-006] Given the same files in any order, When grouped, Then the report is the same', () => {
    fc.assert(fc.property(withPermutation(files), ([a, b]) => {
      expect(groupDuplicates(b)).toEqual(groupDuplicates(a))
    }), propertyParams())
  })
})

describe('duplicate candidates', () => {
  it('[ING-012, FUZ-006] Given any files, When candidates are picked, Then each group shares a size and quick key, no file is in two groups, and every group has two or more', () => {
    fc.assert(
      fc.property(files, list => {
        const groups = duplicateCandidates(list)
        const all = groups.flat().map(f => f.path)
        expect(new Set(all).size).toBe(all.length)
        for (const g of groups) {
          expect(g.length).toBeGreaterThan(1)
          expect(new Set(g.map(f => `${f.sizeBytes}|${f.quickKey}`)).size).toBe(1)
        }
      }),
      propertyParams()
    )
  })

  it('[ING-012, FUZ-006] Given files with equal content, When candidates are picked, Then they always land in one candidate group, so no duplicate is missed by reading only candidates', () => {
    fc.assert(
      fc.property(files, list => {
        const groupOf = new Map<string, number>()
        duplicateCandidates(list).forEach((g, i) => g.forEach(f => groupOf.set(f.path, i)))
        for (const g of groupDuplicates(list).groups) expect(new Set(g.paths.map(p => groupOf.get(p))).size).toBe(1)
        for (const g of groupDuplicates(list).groups) expect(g.paths.every(p => groupOf.has(p))).toBe(true)
      }),
      propertyParams()
    )
  })

  it('[ING-012, FUZ-006] Given the same files in any order, When candidates are picked, Then the same groups come back', () => {
    const asSets = (groups: FileHash[][]) => groups.map(g => g.map(f => f.path).sort().join(',')).sort()
    fc.assert(fc.property(withPermutation(files), ([a, b]) => {
      expect(asSets(duplicateCandidates(b))).toEqual(asSets(duplicateCandidates(a)))
    }), propertyParams())
  })
})

describe('rescans', () => {
  const stamps = fc.uniqueArray(
    fc.record({ path: fc.integer({ min: 0, max: 50 }).map(n => `/f${n}`), sizeBytes: fc.integer({ min: 0, max: 3 }), modifiedAt: fc.constantFrom('a', 'b') }),
    { selector: s => s.path, maxLength: 20 }
  )

  it('[ING-008, FUZ-006] Given what was indexed and what a walk found, When a rescan is planned, Then found files split into unchanged, changed and added once each, and removed is what was indexed and not found', () => {
    fc.assert(
      fc.property(stamps, stamps, (indexed, found) => {
        const plan = planRescan(indexed, found)
        expect([...plan.unchanged, ...plan.changed, ...plan.added].sort()).toEqual(found.map(f => f.path).sort())
        expect(plan.removed.sort()).toEqual(indexed.filter(i => !found.some(f => f.path === i.path)).map(i => i.path).sort())
        for (const p of plan.unchanged) {
          const [a, b] = [indexed.find(f => f.path === p), found.find(f => f.path === p)]
          expect(a?.sizeBytes === b?.sizeBytes && a?.modifiedAt === b?.modifiedAt).toBe(true)
        }
        expect(planRescan(found, found)).toEqual({ unchanged: found.map(f => f.path), changed: [], added: [], removed: [] })
      }),
      propertyParams()
    )
  })
})

describe('the Siril work area', () => {
  const frame = fc.record({
    path: fc.tuple(fileStem, fileStem).map(([dir, name]) => `/source/${dir}/${name}`),
    name: fc.tuple(fc.constantFrom('', 'Light_', 'Dark_', 'FLAT-', 'bias ', 'Offset'), fileStem, fc.constantFrom('.fit', '.FITS', '.cr2', '')).map(([a, b, c]) => `${a}${b}${c}`),
    imageType: fc.option(fc.constantFrom('Light Frame', 'Dark Frame', 'Flat Field', 'Bias Frame', 'LIGHT', 'master dark', 'Offset'), { nil: null })
  })

  it('[ING-013, ING-001, FUZ-006] Given any frames, When the work area is planned, Then every frame is placed exactly once, in a Siril folder, under a name of its own in that folder', () => {
    fc.assert(
      fc.property(fc.array(frame, { maxLength: 40 }), frames => {
        const plan = planSirilWorkspace(frames)
        expect(plan.map(p => p.from)).toEqual(frames.map(f => f.path))
        const names = plan.map(p => `${p.folder}/${p.name.toLowerCase()}`)
        expect(new Set(names).size).toBe(names.length)
        plan.forEach((p, i) => {
          expect(p.folder).toBe(sirilFolderFor(frames[i].name, frames[i].imageType))
          // The work area holds a name, never a path back into the source folder.
          expect(p.name).not.toMatch(/[\\/]/)
          const dot = frames[i].name.lastIndexOf('.')
          if (dot > 0) expect(p.name.endsWith(frames[i].name.slice(dot))).toBe(true)
        })
      }),
      propertyParams()
    )
  })

  it('[ING-013, FUZ-006] Given a frame with an IMAGETYP, When its folder is chosen, Then the IMAGETYP decides whatever the file is called', () => {
    fc.assert(
      fc.property(fileStem, fc.constantFrom('Dark Frame', 'Flat Field', 'Bias Frame', 'Light Frame'), (name, type) => {
        expect(sirilFolderFor(`Dark_${name}`, type)).toBe(sirilFolderFor('x', type))
        expect(sirilFolderFor(name, type)).toBe({ 'Dark Frame': 'darks', 'Flat Field': 'flats', 'Bias Frame': 'biases', 'Light Frame': 'lights' }[type])
      }),
      propertyParams()
    )
  })
})
