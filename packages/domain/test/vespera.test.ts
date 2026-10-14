import { describe, expect, it } from 'vitest'
import {
  DEFAULT_VESPERA_FORMATS,
  VESPERA_DARKS_TARGET,
  copyPace,
  copySpace,
  copyStateOf,
  isScopeHost,
  landingParts,
  landingTarget,
  localName,
  observationOf,
  observationStatuses,
  parseObservationName,
  parseVesperaSettings,
  planCopies,
  plannedFiles,
  sortObservations,
  vesperaFormat,
  vesperaRoots,
  type ListedTree,
  type Observation
} from '@astro/domain'

const file = (relative: string, sizeBytes: number | null): ListedTree[number] => ({
  relative,
  entry: { name: relative.split('/').at(-1)!, kind: 'file', sizeBytes }
})

const m42 = observationOf('observation', '/user', '2024-03-10_21-33-02_M 42', [
  file('01-images-initial/img-0001.fits', 100),
  file('01-images-initial/img-0002.fits', 100),
  file('01-images-initial/output.jpeg', 10),
  file('01-images-initial/stack.tiff', 50),
  file('observation.json', 5),
  file('notes.txt', 1)
])

describe('Vespera settings', () => {
  it('[VSP-014] Given nothing saved, When read, Then the defaults are used: 10.0.0.1 on port 21, FITS and JSON, landing in the home raw folder', () => {
    expect(parseVesperaSettings({}, '/nas/home/raw')).toEqual({
      host: '10.0.0.1', port: 21, landingRoot: '/nas/home/raw', landingIsHomeRaw: true, formats: ['fits', 'json'], ignored: []
    })
    expect(parseVesperaSettings({}, null).landingRoot).toBeNull()
  })

  it('[VSP-012] Given a landing folder of its own and an address with a port, When read, Then both are used', () => {
    const s = parseVesperaSettings({ vespera_host: ' vespera.local:2121 ', vespera_landing: 'D:\\Vespera', vespera_formats: 'tiff, FITS' }, '/home/raw')
    expect(s).toMatchObject({ host: 'vespera.local', port: 2121, landingRoot: 'D:\\Vespera', landingIsHomeRaw: false, formats: ['fits', 'tiff'], ignored: [] })
  })

  it('[VSP-014] Given an unreadable address or no image kinds, When read, Then the defaults are used and each is reported as not read', () => {
    for (const bad of ['10.0.0.300', 'not an address', '10.0.0.1:0', '10.0.0.1:99999', 'a:b:c', '-bad-.host']) {
      const s = parseVesperaSettings({ vespera_host: bad }, null)
      expect([s.host, s.port, s.ignored]).toEqual(['10.0.0.1', 21, ['vespera_host']])
    }
    expect(parseVesperaSettings({ vespera_host: '10.0.0.1:21' }, null).ignored).toEqual([])
    expect(parseVesperaSettings({ vespera_formats: 'json' }, null)).toMatchObject({ formats: [...DEFAULT_VESPERA_FORMATS], ignored: ['vespera_formats'] })
    expect(parseVesperaSettings({ vespera_formats: 'png,raw' }, null).ignored).toEqual(['vespera_formats'])
    expect(parseVesperaSettings({ vespera_formats: '' }, null).ignored).toEqual([])
  })

  it('[VSP-014] Given addresses, When checked, Then IPv4 addresses and host names pass and other text does not', () => {
    expect(['10.0.0.1', '192.168.4.1', 'vespera', 'vespera-pro.local'].every(isScopeHost)).toBe(true)
    expect(['10.0.0', '10.0.0.256', '', 'a_b', 'x..y', '-x', `${'a'.repeat(64)}.com`].some(isScopeHost)).toBe(false)
  })
})

describe('observation names', () => {
  it('[VSP-015] Given folder names in several shapes, When read, Then the date, time and target come out', () => {
    expect(parseObservationName('2024-03-10_21-33-02_M 42')).toEqual({ takenAt: '2024-03-10T21:33:02', target: 'M 42' })
    expect(parseObservationName('M42 20240310 2133')).toEqual({ takenAt: '2024-03-10T21:33', target: 'M42' })
    expect(parseObservationName('2024-03-10T21:33:02')).toEqual({ takenAt: '2024-03-10T21:33:02', target: null })
    expect(parseObservationName('NGC 7000 - 2023.08.14')).toEqual({ takenAt: '2023-08-14', target: 'NGC 7000' })
    expect(parseObservationName('Andromeda')).toEqual({ takenAt: null, target: 'Andromeda' })
  })

  it('[VSP-015] Given a date that is not a real day or a time that is not a real time, When read, Then it is not taken as a date or time', () => {
    expect(parseObservationName('2024-02-30_M 42')).toEqual({ takenAt: null, target: '2024-02-30 M 42' })
    expect(parseObservationName('2023-02-29')).toEqual({ takenAt: null, target: '2023-02-29' })
    expect(parseObservationName('2024-02-29_25-10_M 42')).toEqual({ takenAt: '2024-02-29', target: '25-10 M 42' })
    expect(parseObservationName('1999-01-01 M 1')).toEqual({ takenAt: null, target: '1999-01-01 M 1' })
    expect(parseObservationName('123456789')).toEqual({ takenAt: null, target: '123456789' })
  })
})

describe('the scope layout', () => {
  it('[VSP-001] Given file names, When their kind is read, Then FITS, TIFF, JPEG and JSON are known and anything else is not', () => {
    expect(['a.fit', 'a.FITS', 'a.fts', 'a.tif', 'a.TIFF', 'a.jpg', 'a.jpeg', 'a.json'].map(vesperaFormat)).toEqual(['fits', 'fits', 'fits', 'tiff', 'tiff', 'jpeg', 'jpeg', 'json'])
    expect(['a.txt', 'fits', '.fits', 'a.'].map(vesperaFormat)).toEqual([null, null, null, null])
  })

  it('[VSP-001] Given a top-level listing in any case, When read, Then the user and darks folders are found', () => {
    expect(vesperaRoots([
      { name: 'User', kind: 'dir', sizeBytes: null },
      { name: 'Expert Mode', kind: 'dir', sizeBytes: null },
      { name: 'user', kind: 'file', sizeBytes: 1 }
    ])).toEqual({ user: 'User', darks: 'Expert Mode' })
    expect(vesperaRoots([])).toEqual({ user: null, darks: null })
  })

  it('[VSP-001] Given an observation folder, When read, Then its known files come sorted with their kinds and its name gives the target', () => {
    expect(m42).toMatchObject({ kind: 'observation', remote: '/user/2024-03-10_21-33-02_M 42', takenAt: '2024-03-10T21:33:02', target: 'M 42' })
    expect(m42.files.map(f => [f.relative, f.format])).toEqual([
      ['01-images-initial/img-0001.fits', 'fits'],
      ['01-images-initial/img-0002.fits', 'fits'],
      ['01-images-initial/output.jpeg', 'jpeg'],
      ['01-images-initial/stack.tiff', 'tiff'],
      ['observation.json', 'json']
    ])
    const darks = observationOf('darks', '/', 'expert mode', [{ relative: 'sub', entry: { name: 'sub', kind: 'dir', sizeBytes: null } }])
    expect(darks).toMatchObject({ remote: '/expert mode', target: VESPERA_DARKS_TARGET, takenAt: null, files: [] })
  })

  it('[VSP-001] Given observations, When sorted, Then the newest comes first and darks last', () => {
    const make = (folder: string, kind: Observation['kind'] = 'observation') => observationOf(kind, '/user', folder, [])
    const sorted = sortObservations([make('2024-01-01 M 1'), make('expert mode', 'darks'), make('Andromeda'), make('2024-03-01 M 3'), make('2024-03-01 M 2')])
    expect(sorted.map(o => o.folder)).toEqual(['2024-03-01 M 3', '2024-03-01 M 2', '2024-01-01 M 1', 'Andromeda', 'expert mode'])
  })
})

describe('landing names', () => {
  it('[VSP-013] Given names Windows refuses, When made safe, Then reserved characters, trailing dots and device names are changed and nothing is empty', () => {
    expect(localName('M 42: Orion?')).toBe('M 42_ Orion_')
    expect(localName('trailing. ')).toBe('trailing')
    expect(localName('CON')).toBe('_CON')
    expect(localName('com1.fits')).toBe('_com1.fits')
    expect(localName('..')).toBe('_')
    expect(localName('')).toBe('_')
    expect(localName('a/b\\c')).toBe('a_b_c')
  })

  it('[VSP-003] Given a confirmed name, the name in the folder, or neither, When the target folder is chosen, Then the first there is used', () => {
    expect(landingTarget(m42, '  Orion Nebula ')).toBe('Orion Nebula')
    expect(landingTarget(m42, '')).toBe('M 42')
    expect(landingTarget({ ...m42, target: null }, null)).toBe('Vespera')
    expect(landingParts(m42, 'M 42', m42.files[0])).toEqual(['M 42', '2024-03-10_21-33-02_M 42', '01-images-initial', 'img-0001.fits'])
  })
})

describe('copy plans', () => {
  const planned = plannedFiles([m42], [{ folder: m42.folder, kind: 'observation' }], ['fits', 'json'])
  const at = (name: string) => `M 42/2024-03-10_21-33-02_M 42/${name}`

  it('[VSP-003] Given chosen kinds, When planned, Then only those files are planned, each from the scope to its landing place', () => {
    expect(planned.map(p => [p.remote, p.parts.join('/')])).toEqual([
      ['/user/2024-03-10_21-33-02_M 42/01-images-initial/img-0001.fits', at('01-images-initial/img-0001.fits')],
      ['/user/2024-03-10_21-33-02_M 42/01-images-initial/img-0002.fits', at('01-images-initial/img-0002.fits')],
      ['/user/2024-03-10_21-33-02_M 42/observation.json', at('observation.json')]
    ])
    expect(plannedFiles([m42], [{ folder: 'other', kind: 'observation' }, { folder: m42.folder, kind: 'darks' }], ['fits'])).toEqual([])
  })

  it('[VSP-004] [VSP-006] Given files already on the PC, When the copy is planned, Then same-size ones are skipped as copied and other sizes are left alone, never overwritten', () => {
    const plan = planCopies(planned, new Map([
      [at('01-images-initial/img-0001.fits'), 100],
      [at('01-images-initial/img-0002.fits'), 7],
      [at('observation.json'), null]
    ]))
    expect(plan.copies.map(c => c.parts.at(-1))).toEqual(['observation.json'])
    expect(plan.skipped.map(s => [s.parts.at(-1), s.reason])).toEqual([['img-0001.fits', 'already-copied'], ['img-0002.fits', 'different-file']])
    expect(plan.bytes).toBe(5)
  })

  it('[VSP-006] [VSP-013] Given two scope names that become one on Windows, When planned, Then the second is skipped rather than written over the first', () => {
    const twins = observationOf('observation', '/user', 'obs', [file('a?.fits', 1), file('a_.fits', 2), file('A_.FITS', 3)])
    const plan = planCopies(plannedFiles([twins], [{ folder: 'obs', kind: 'observation' }], ['fits']), new Map())
    expect(plan.copies.map(c => c.sizeBytes)).toEqual([3])
    expect(plan.skipped.map(s => [s.sizeBytes, s.reason])).toEqual([[1, 'same-name'], [2, 'same-name']])
  })

  it('[VSP-004] Given a file the scope lists without a size, When something is already at its place, Then it is left alone and counts no bytes', () => {
    const unsized = observationOf('observation', '/user', 'obs', [file('x.fits', null)])
    const p = plannedFiles([unsized], [{ folder: 'obs', kind: 'observation' }], ['fits'])
    expect(planCopies(p, new Map([['obs/obs/x.fits', 4]])).skipped[0].reason).toBe('different-file')
    expect(planCopies(p, new Map()).bytes).toBe(0)
  })

  it('[VSP-010] Given the bytes to copy and the free space, When checked, Then a 1% margin is kept and short room is not enough', () => {
    const plan = { copies: [], skipped: [], bytes: 1000 }
    expect(copySpace(plan, 1010)).toMatchObject({ fits: true, neededBytes: 1010, headroomBytes: 0 })
    expect(copySpace(plan, 1009)).toMatchObject({ fits: false, shortBytes: 1 })
    expect(copySpace(plan, null).fits).toBe(true)
  })

  it('[VSP-001] Given an observation partly on the PC, When its status is read, Then it counts what is copied, new and left alone', () => {
    const [status] = observationStatuses([m42], ['fits', 'json'], new Map([[at('01-images-initial/img-0001.fits'), 100], [at('observation.json'), 3]]))
    expect(status).toMatchObject({
      files: 3, bytes: 205, copiedFiles: 1, newFiles: 1, newBytes: 100, differentFiles: 1, landsIn: 'M 42', state: 'partly',
      counts: { fits: 2, tiff: 1, jpeg: 1, json: 1 }
    })
  })

  it('[VSP-001] Given counts, When the state is read, Then empty, copied, new and partly are told apart', () => {
    expect(copyStateOf(0, 0, 0)).toBe('empty')
    expect(copyStateOf(3, 0, 1)).toBe('copied')
    expect(copyStateOf(3, 2, 1)).toBe('new')
    expect(copyStateOf(3, 3, 0)).toBe('new')
    expect(copyStateOf(3, 1, 0)).toBe('partly')
  })
})

describe('copy pace', () => {
  it('[VSP-011] Given bytes done over time, When the pace is read, Then speed and time left follow, and the first second gives none', () => {
    expect(copyPace(0, 1000, 5000)).toEqual({ fraction: 0, bytesPerSecond: null, remainingSeconds: null })
    expect(copyPace(500, 1000, 999)).toEqual({ fraction: 0.5, bytesPerSecond: null, remainingSeconds: null })
    expect(copyPace(500, 1000, 2000)).toEqual({ fraction: 0.5, bytesPerSecond: 250, remainingSeconds: 2 })
    expect(copyPace(10, 0, 2000)).toMatchObject({ fraction: 1, remainingSeconds: 0 })
    expect(copyPace(2000, 1000, 2000)).toMatchObject({ fraction: 1, remainingSeconds: 0 })
    expect(copyPace(-5, -1, Number.NaN)).toEqual({ fraction: 1, bytesPerSecond: null, remainingSeconds: null })
  })
})
