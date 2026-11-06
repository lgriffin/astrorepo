import { describe, expect, it } from 'vitest'
import {
  CONVENTIONAL_FOLDERS,
  LIBRARY_FOLDER_KEYS,
  LIBRARY_ROLES,
  LIBRARY_ROLE_LABELS,
  LIBRARY_ROLE_NAMES,
  conventionalFolder,
  layoutProblems,
  resolveLayout,
  roleByName,
  samePathKey,
  sampleKind,
  scoreFolder,
  suggestLayout,
  suggestedChanges,
  type FolderSample
} from '../src'

const folder = (name: string, files: string[] = [], extra: Partial<FolderSample> = {}): FolderSample => ({
  name,
  path: `D:/Astro/${name}`,
  files,
  objectFolders: 0,
  isObject: false,
  ...extra
})

const lights = (n: number) => Array.from({ length: n }, (_, i) => `Light_M 31_10.0s_IRCUT_2026090${i % 10}-21${i}.fit`)
const join = (name: string) => `D:/Astro/${name}`

describe('library layout: the parts', () => {
  it('[LAY-001] Given the parts, When listed, Then raw, stacked, tif and images come in scan order with their conventional names, labels and setting keys', () => {
    expect(LIBRARY_ROLES).toEqual(['raw', 'stacked', 'tif', 'images'])
    expect(CONVENTIONAL_FOLDERS).toEqual({ raw: 'raw', stacked: 'stacked', tif: 'tif', images: 'images' })
    expect(LIBRARY_ROLE_LABELS).toEqual({ raw: 'Raw frames', stacked: 'Stacked masters', tif: 'TIFF exports', images: 'Finished pictures' })
    expect(LIBRARY_ROLE_NAMES).toEqual({ raw: 'raw frames', stacked: 'stacked masters', tif: 'TIFF exports', images: 'finished pictures' })
    expect(LIBRARY_FOLDER_KEYS).toEqual({ raw: 'library_raw_folder', stacked: 'library_stacked_folder', tif: 'library_tif_folder', images: 'library_images_folder' })
  })
})

describe('library layout: what a file looks like', () => {
  it.each([
    ['Light_M 31_10.0s_IRCUT_20260901-213000.fit', 'light'],
    ['m31_light_001.fits', 'light'],
    ['lights.fts', 'light'],
    ['Stacked_120_M 31_10.0s_IRCUT.fit', 'master'],
    ['M31_stacked.fits', 'master'],
    ['master_dark_120s.fit', 'master'],
    ['integration_M31.fit', 'master'],
    ['M31_drizzle_2x.fit', 'master'],
    ['result_M31.fit', 'master'],
    ['M31_0001.fit', 'fits'],
    ['flightdeck.fit', 'fits'],
    ['IMG_0001.CR2', 'camera-raw'],
    ['DSC_0001.nef', 'camera-raw'],
    ['IMG_0001.CR3', 'camera-raw'],
    ['M31.tif', 'tiff'],
    ['M31.TIFF', 'tiff'],
    ['M31.png', 'picture'],
    ['M31.JPG', 'picture'],
    ['M31.jpeg', 'picture'],
    ['notes.txt', 'other'],
    ['observation.json', 'other']
  ])('[LAY-003] Given a file named %s, When judged by its name, Then it is %s', (name, kind) => {
    expect(sampleKind(name)).toBe(kind)
  })

  it('[LAY-003] Given a FITS file whose name says both light and stacked, When judged, Then stacked wins', () => {
    expect(sampleKind('r_pp_light_stacked.fit')).toBe('master')
  })
})

describe('library layout: what a folder name says', () => {
  it.each([
    ['raw', 'raw'], ['RAW', 'raw'], ['Raw Data', 'raw'], ['Lights', 'raw'], ['light-frames', 'raw'], ['Subs', 'raw'], ['Captures', 'raw'], ['raw_fits', 'raw'],
    ['stacked', 'stacked'], ['Stacks', 'stacked'], ['Masters', 'stacked'], ['Integration', 'stacked'],
    ['TIF', 'tif'], ['tiff', 'tif'], ['Exports', 'tif'], ['TIFF exports', 'tif'],
    ['images', 'images'], ['Final', 'images'], ['Finished', 'images'], ['Processed', 'images'], ['Pictures', 'images'], ['Gallery', 'images'], ['JPG', 'images']
  ])('[LAY-003] Given a folder named %s, When its name is read, Then it says %s', (name, role) => {
    expect(roleByName(name)).toBe(role)
  })

  it.each(['M 31', 'Darks', 'Archive', 'rawish', 'old raw'])('[LAY-003] Given a folder named %s, When its name is read, Then it says nothing', name => {
    expect(roleByName(name)).toBeNull()
  })
})

describe('library layout: scoring a folder', () => {
  const score = (f: FolderSample, role: string) => scoreFolder(f).find(s => s.role === role)!

  it('[LAY-003] Given a folder named raw full of lights, When scored, Then raw scores its name and contents with both reasons', () => {
    const s = score(folder('raw', lights(10), { objectFolders: 3 }), 'raw')
    expect(s.score).toBe(16)
    expect(s.basis).toBe('name')
    expect(s.reasons).toEqual(['It is called raw.', 'Light frames: 10 of 10 files looked at. It holds 3 folders named for objects.'])
  })

  it('[LAY-003] Given one object folder, When the reason is written, Then it says folder, not folders', () => {
    expect(score(folder('x', lights(2), { objectFolders: 1 }), 'raw').reasons).toEqual(['Light frames: 2 of 2 files looked at. It holds 1 folder named for objects.'])
  })

  it('[LAY-003] Given one file looked at, When the reason is written, Then it says file, not files', () => {
    expect(score(folder('x', ['Stacked_1.fit']), 'stacked').reasons).toEqual(['Named as stacks or masters: 1 of 1 file looked at.'])
  })

  it('[LAY-003] Given camera RAW frames, When scored, Then they count as raw and the reason says so', () => {
    const s = score(folder('DSLR', ['IMG_1.CR2', 'IMG_2.CR2', 'notes.txt', 'IMG_3.CR2']), 'raw')
    expect(s.score).toBe(4.5)
    expect(s.basis).toBe('contents')
    expect(s.reasons).toEqual(['Light frames or camera RAW: 3 of 4 files looked at.'])
  })

  it('[LAY-003] Given plainly named FITS files, When scored, Then they count half for raw and a quarter for stacked', () => {
    const f = folder('Data', ['a.fit', 'b.fit', 'c.fit', 'd.fit'])
    expect(score(f, 'raw').score).toBe(3)
    expect(score(f, 'raw').reasons).toEqual(['FITS files: 4 of 4 files looked at.'])
    expect(score(f, 'stacked').score).toBe(1.5)
    expect(score(f, 'stacked').reasons).toEqual(['Named as stacks or masters: 0 of 4 files looked at.'])
  })

  it('[LAY-003] Given masters, TIFF and pictures, When scored, Then each counts for its own part', () => {
    expect(score(folder('A', ['Stacked_1.fit', 'Stacked_2.fit']), 'stacked')).toMatchObject({ score: 6, reasons: ['Named as stacks or masters: 2 of 2 files looked at.'] })
    expect(score(folder('B', ['a.tif', 'b.png']), 'tif')).toMatchObject({ score: 3, reasons: ['TIFF: 1 of 2 files looked at.'] })
    expect(score(folder('C', ['a.tif', 'b.png']), 'images')).toMatchObject({ score: 3, reasons: ['PNG or JPEG pictures: 1 of 2 files looked at.'] })
  })

  it('[LAY-003] Given an empty folder with no telling name, When scored, Then every part scores nothing and gives no reason', () => {
    for (const s of scoreFolder(folder('empty'))) {
      expect(s.score).toBe(0)
      expect(s.reasons).toEqual([])
      expect(s.basis).toBe('contents')
    }
  })

  it('[LAY-003] Given an empty folder named stacked, When scored, Then only its name counts', () => {
    expect(score(folder('stacked'), 'stacked')).toMatchObject({ score: 10, basis: 'name', reasons: ['It is called stacked.'] })
    expect(score(folder('stacked'), 'raw').score).toBe(0)
  })
})

describe('library layout: the suggestion', () => {
  it('[LAY-003] Given folders named their own way, When a layout is suggested, Then each part gets the folder that looks like it, with reasons', () => {
    const s = suggestLayout([
      folder('Lights', lights(20)),
      folder('Masters', ['Stacked_120_M 31.fit', 'Stacked_60_M 42.fit']),
      folder('Exports', ['M 31.tif']),
      folder('Final', ['M 31.jpg', 'M 42.png']),
      folder('Darks', ['dark_001.txt'])
    ])
    expect(s.roles.map(r => [r.role, r.name, r.basis])).toEqual([
      ['raw', 'Lights', 'name'],
      ['stacked', 'Masters', 'name'],
      ['tif', 'Exports', 'name'],
      ['images', 'Final', 'name']
    ])
    expect(s.roles[0].path).toBe('D:/Astro/Lights')
    expect(s.roles[0].reasons[0]).toBe('It is called Lights.')
    expect(s.missing).toEqual([])
    expect(s.unused).toEqual(['Darks'])
    expect(s.byTarget).toBe(false)
  })

  it('[LAY-003] Given folders with names that say nothing, When a layout is suggested, Then their contents decide', () => {
    const s = suggestLayout([
      folder('A', ['Stacked_1.fit', 'Stacked_2.fit', 'Stacked_3.fit']),
      folder('B', lights(8)),
      folder('C', ['x.tif', 'y.tif']),
      folder('D', ['x.png'])
    ])
    expect(s.roles.map(r => [r.role, r.name, r.basis])).toEqual([['raw', 'B', 'contents'], ['stacked', 'A', 'contents'], ['tif', 'C', 'contents'], ['images', 'D', 'contents']])
  })

  it('[LAY-003] Given one folder that looks like two parts, When a layout is suggested, Then it plays only the part it looks most like', () => {
    const s = suggestLayout([folder('Everything', [...lights(6), 'Stacked_1.fit', 'a.png'])])
    expect(s.roles.map(r => r.role)).toEqual(['raw'])
    expect(s.missing).toEqual(['stacked', 'tif', 'images'])
  })

  it('[LAY-003] Given two folders that look like the same part, When a layout is suggested, Then the stronger one wins and the other is unused', () => {
    const s = suggestLayout([folder('raw'), folder('Lights', lights(10)), folder('old', ['a.fit'])])
    expect(s.roles.map(r => r.name)).toEqual(['Lights'])
    expect(s.unused).toEqual(['old', 'raw'])
  })

  it('[LAY-003] Given a folder with the conventional name tied with another, When a layout is suggested, Then the conventional one wins, so nothing changes', () => {
    const s = suggestLayout([folder('Lights', lights(2)), folder('RAW', lights(3))])
    expect(s.roles.map(r => r.name)).toEqual(['RAW'])
    expect(suggestLayout([folder('RAW', lights(3)), folder('Lights', lights(2))]).roles[0].name).toBe('RAW')
  })

  it('[LAY-003] Given a folder that looks only a little like a part, When a layout is suggested, Then it is not suggested', () => {
    // One light in five files is 1.2 points, under the 3 a suggestion needs.
    const s = suggestLayout([folder('Misc', ['Light_1.fit', 'a.txt', 'b.txt', 'c.txt', 'd.txt'])])
    expect(s.roles).toEqual([])
    expect(s.missing).toEqual(['raw', 'stacked', 'tif', 'images'])
    expect(s.unused).toEqual(['Misc'])
  })

  it('[LAY-003] Given a folder scoring exactly the threshold, When a layout is suggested, Then it is suggested', () => {
    expect(suggestLayout([folder('Data', ['a.fit', 'b.fit'])]).roles.map(r => r.role)).toEqual(['raw'])
  })

  it('[LAY-003] Given folders tied for one part, When a layout is suggested, Then the answer is the same whatever order they come in', () => {
    const a = folder('B', ['x.tif'])
    const b = folder('A', ['y.tif'])
    expect(suggestLayout([a, b]).roles[0].name).toBe('A')
    expect(suggestLayout([b, a]).roles[0].name).toBe('A')
  })

  it('[LAY-003] Given a folder scoring the same for two parts, When a layout is suggested, Then it takes the part the scan reads first', () => {
    const s = suggestLayout([folder('Mixed', ['a.tif', 'b.png'])])
    expect(s.roles.map(r => r.role)).toEqual(['tif'])
  })

  it('[LAY-002] Given no folders, When a layout is suggested, Then every part is missing and the library is not called filed by target', () => {
    expect(suggestLayout([])).toEqual({ roles: [], missing: ['raw', 'stacked', 'tif', 'images'], unused: [], byTarget: false })
  })

  it('[LAY-007] Given a home folder of folders named for objects, When a layout is suggested, Then it says the library is filed by target first', () => {
    const objects = ['M 31', 'M 42', 'NGC 7000'].map(n => folder(n, ['raw.txt'], { isObject: true }))
    expect(suggestLayout([...objects, folder('tools')]).byTarget).toBe(true)
  })

  it('[LAY-007] Given exactly half the folders named for objects, When a layout is suggested, Then it is not called filed by target', () => {
    expect(suggestLayout([folder('M 31', [], { isObject: true }), folder('raw')]).byTarget).toBe(false)
  })
})

describe('library layout: which folder each part reads', () => {
  it('[LAY-001] Given nothing chosen and conventional folders in another case, When resolved, Then each is found by its name in any case', () => {
    const r = resolveLayout({}, ['RAW', 'Stacked', 'TIF', 'Images', 'misc'], join)
    expect(r).toEqual({
      raw: { path: 'D:/Astro/RAW', source: 'named' },
      stacked: { path: 'D:/Astro/Stacked', source: 'named' },
      tif: { path: 'D:/Astro/TIF', source: 'named' },
      images: { path: 'D:/Astro/Images', source: 'named' }
    })
  })

  it('[LAY-001] Given both raw and RAW, When resolved, Then the exact name wins', () => {
    expect(conventionalFolder('raw', ['RAW', 'raw'])).toBe('raw')
    expect(conventionalFolder('raw', ['RAW'])).toBe('RAW')
    expect(conventionalFolder('raw', ['Lights'])).toBeNull()
  })

  it('[LAY-004] Given folders chosen, When resolved, Then a chosen folder wins and a blank choice falls back to the name', () => {
    const r = resolveLayout({ raw: 'E:/Lights', stacked: '  ', tif: null }, ['tif'], join)
    expect(r.raw).toEqual({ path: 'E:/Lights', source: 'chosen' })
    expect(r.stacked).toEqual({ path: 'D:/Astro/stacked', source: 'missing' })
    expect(r.tif).toEqual({ path: 'D:/Astro/tif', source: 'named' })
    expect(r.images).toEqual({ path: 'D:/Astro/images', source: 'missing' })
  })

  it('[LAY-004] Given a chosen folder with spaces round it, When resolved, Then the spaces are dropped', () => {
    expect(resolveLayout({ raw: '  E:/Lights ' }, [], join).raw.path).toBe('E:/Lights')
  })
})

describe('library layout: checking a choice', () => {
  it('[LAY-006] Given each part in its own folder, When checked, Then there is no problem', () => {
    expect(layoutProblems({ raw: 'D:/A/raw', stacked: 'D:/A/stacked', tif: 'E:/tif', images: null })).toEqual([])
  })

  it('[LAY-006] Given two parts in one folder spelled differently, When checked, Then it is refused', () => {
    expect(layoutProblems({ raw: 'D:\\Astro\\Data\\', stacked: 'd:/astro/data' })).toEqual(['Raw frames and stacked masters are the same folder.'])
  })

  it('[LAY-006] Given one part inside another, When checked, Then it is refused either way round', () => {
    expect(layoutProblems({ raw: 'D:/Astro', images: 'D:/Astro/images' })).toEqual(['Finished pictures are inside the folder for raw frames.'])
    expect(layoutProblems({ stacked: 'D:/Astro/raw/stacks', raw: 'D:/Astro/raw' })).toEqual(['Stacked masters are inside the folder for raw frames.'])
  })

  it('[LAY-006] Given folders that only share the start of a name, When checked, Then they are not one inside the other', () => {
    expect(layoutProblems({ raw: 'D:/Astro/raw', stacked: 'D:/Astro/raw2' })).toEqual([])
  })

  it('[LAY-006] Given blank choices, When checked, Then they are left out', () => {
    expect(layoutProblems({ raw: ' ', stacked: '', tif: null })).toEqual([])
  })

  it('[LAY-006] Given a path, When made into a key, Then slashes, a trailing slash, spaces and case do not matter', () => {
    expect(samePathKey(' D:\\Astro\\Raw\\ ')).toBe('d:/astro/raw')
  })
})

describe('library layout: what the suggestion would change', () => {
  const suggestion = suggestLayout([folder('Lights', lights(5)), folder('raw', []), folder('Final', ['a.png'])])

  it('[LAY-005] Given a missing part the suggestion fills, When the changes are listed, Then it is offered', () => {
    const now = resolveLayout({}, ['Lights', 'Final'], join)
    expect(suggestedChanges(now, suggestion).map(c => [c.role, c.name])).toEqual([['raw', 'Lights'], ['images', 'Final']])
  })

  it('[LAY-005] Given a part already read from the suggested folder, When the changes are listed, Then it is not offered', () => {
    const now = resolveLayout({ images: 'd:/astro/final/' }, ['Lights'], join)
    expect(suggestedChanges(now, suggestion).map(c => c.role)).toEqual(['raw'])
  })

  it('[LAY-005] Given a part read from a folder whose name differs from the suggestion only by case, When the changes are listed, Then it is offered, since case can name two folders', () => {
    const now = resolveLayout({}, ['Images'], join)
    const lower = suggestLayout([folder('images', ['a.png'])])
    expect(suggestedChanges(now, lower).map(c => [c.role, c.path])).toEqual([['images', join('images')]])
  })

  it('[LAY-005] Given a part the user chose, When the suggestion differs, Then it is never offered', () => {
    const now = resolveLayout({ raw: 'E:/Elsewhere' }, [], join)
    expect(suggestedChanges(now, suggestion).map(c => c.role)).toEqual(['images'])
  })
})
