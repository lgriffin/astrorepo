import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  FITS_EXTENSIONS,
  READABLE_RAW_EXTENSIONS,
  archiveFolderName,
  bayerChannels,
  filterFamily,
  filterFolderName,
  filterWorkDir,
  frameFileKind,
  planFilterStacks,
  profileForObjectType,
  PROFILES,
  sameFilter,
  type FilterFrame
} from '@astro/domain'
import { anyText, fileStem, instant, propertyParams } from './arbitraries'

/** Characters no Windows, macOS or Linux disk takes in a folder name, and control characters. */
const UNSAFE = new RegExp(`[<>:"/\\\\|?*${String.fromCharCode(0)}-${String.fromCharCode(0x1f)}]`)

describe('archive folder names', () => {
  it('[ARC-012, FUZ-006] Given any target name, When the archive folder is named, Then the name is safe on every disk, ends with the day and never starts or ends with a space or dot', () => {
    fc.assert(
      fc.property(fc.option(anyText, { nil: null }), instant, (name, at) => {
        const folder = archiveFolderName(name, at)
        expect(folder).not.toMatch(UNSAFE)
        expect(folder).not.toMatch(/^[ .]/)
        expect(folder.endsWith(`${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`)).toBe(true)
        expect(folder).not.toMatch(/^\.\.?( |$)/)
      }),
      propertyParams()
    )
  })

  it('[ARC-012, FUZ-006] Given the same name and day, When named twice, Then the folder name is the same; and a name already safe is kept', () => {
    fc.assert(
      fc.property(anyText, instant, fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9 _-]{0,20}[A-Za-z0-9]$/), (name, at, safe) => {
        expect(archiveFolderName(name, at)).toBe(archiveFolderName(name, new Date(at.getTime())))
        expect(archiveFolderName(safe, at).startsWith(`${safe} `)).toBe(true)
      }),
      propertyParams()
    )
  })
})

describe('filter folders', () => {
  it('[RIG-006, FUZ-006] Given any filter name, When its folder name is made, Then it is letters, digits, dashes and underscores only, never empty, never starting or ending with an underscore, and making it again changes nothing', () => {
    fc.assert(
      fc.property(anyText, filter => {
        const name = filterFolderName(filter)
        expect(name).toMatch(/^[A-Za-z0-9-](?:[A-Za-z0-9_-]*[A-Za-z0-9-])?$/)
        expect(filterFolderName(name)).toBe(name)
      }),
      propertyParams()
    )
  })

  it('[RIG-006, NFR-015, FUZ-006] Given any work folder and folder name, When a filter\'s work folder is made, Then it is inside the work folder\'s filters folder, one level down', () => {
    fc.assert(
      fc.property(fc.constantFrom('/work/M 42', 'C:\\work\\M42', '/w/', 'D:\\w\\\\'), anyText, (workDir, name) => {
        const dir = filterWorkDir(workDir, name)
        const sep = workDir.includes('\\') ? '\\' : '/'
        const base = `${workDir.replace(/[\\/]+$/, '')}${sep}filters${sep}`
        expect(dir.startsWith(base)).toBe(true)
        expect(dir.slice(base.length)).not.toMatch(/[\\/]|^\.\.?$/)
      }),
      propertyParams()
    )
  })

  it('[RIG-006, FUZ-006] Given lights with any filter names, When per-filter stacks are planned, Then no two filters share a folder name, even ignoring case, and every light with a filter is counted once', () => {
    const frames = fc.array(
      fc.record({
        folder: fc.constantFrom('lights', 'lights', 'flats', 'darks', 'biases') as fc.Arbitrary<FilterFrame['folder']>,
        filter: fc.option(fc.oneof(fc.constantFrom('Ha', 'HA', ' ha ', 'S II', 'S.II', 's ii', 'OIII', 'L', 'R', 'G', 'B'), fileStem), { nil: null })
      }),
      { maxLength: 40 }
    )
    fc.assert(
      fc.property(frames, list => {
        const plan = planFilterStacks(list)
        if (!plan) return
        const folders = plan.filters.map(f => f.folderName.toLowerCase())
        expect(new Set(folders).size).toBe(folders.length)
        const lights = list.filter(f => f.folder === 'lights')
        expect(plan.filters.reduce((n, f) => n + f.lights, 0) + plan.unfilteredLights).toBe(lights.length)
        for (const f of plan.filters) expect(f.lights).toBe(lights.filter(l => sameFilter(l.filter, f.filter)).length)
      }),
      propertyParams()
    )
  })

  it('[RIG-010, FUZ-006] Given a filter name, When its family is read, Then case and a bandwidth suffix do not change it', () => {
    fc.assert(
      fc.property(fc.constantFrom('Ha', 'H-alpha', 'OIII', 'O3', 'SII', 'S II', 'L', 'Lum', 'Red', 'B', 'L-eXtreme', 'IRCUT'), fc.constantFrom('', ' 7nm', ' 3 nm', '-6.5nm', ' (12nm)'), fc.boolean(), (name, band, upper) => {
        const written = `${upper ? name.toUpperCase() : name.toLowerCase()}${band}`
        expect(filterFamily(written)).toBe(filterFamily(name))
      }),
      propertyParams()
    )
  })
})

describe('frame files and Bayer patterns', () => {
  it('[RIG-001, FUZ-006] Given any file stem and frame extension in any case, When its kind is read, Then the extension alone decides it', () => {
    fc.assert(
      fc.property(fileStem, fc.constantFrom(...FITS_EXTENSIONS, ...READABLE_RAW_EXTENSIONS, '.cr3', '.raf', '.txt', '.jpg'), fc.boolean(), (stem, ext, upper) => {
        const name = `${stem}${upper ? ext.toUpperCase() : ext}`
        const expected = (FITS_EXTENSIONS as readonly string[]).includes(ext) ? 'fits' : (READABLE_RAW_EXTENSIONS as readonly string[]).includes(ext) ? 'raw' : ext === '.cr3' || ext === '.raf' ? 'raw-unread' : null
        expect(frameFileKind(name)).toBe(expected)
      }),
      propertyParams()
    )
  })

  it('[INS-001, FUZ-006] Given every arrangement of R, G, G and B in any case with spaces around, When read as a Bayer pattern, Then it reads as those channels in order; any other text is not a pattern', () => {
    fc.assert(
      fc.property(fc.shuffledSubarray(['R', 'G', 'G', 'B'], { minLength: 4, maxLength: 4 }), fc.boolean(), fc.constantFrom('', ' ', '\t'), (cells, lower, pad) => {
        const text = `${pad}${lower ? cells.join('').toLowerCase() : cells.join('')}${pad}`
        expect(bayerChannels(text)).toEqual(cells)
      }),
      propertyParams()
    )
    fc.assert(
      fc.property(anyText, text => {
        const out = bayerChannels(text)
        if (out) expect([...out].sort().join('')).toBe('BGGR')
      }),
      propertyParams()
    )
  })

  it('[PPR-001, FUZ-006] Given any object type, When a post-processing profile is picked, Then it is always one of the profiles', () => {
    fc.assert(
      fc.property(fc.option(fc.oneof(anyText, fc.constantFrom('constructor', 'toString', '__proto__', 'galaxy', 'hasOwnProperty')), { nil: null }), type => {
        expect(PROFILES).toContain(profileForObjectType(type).profile)
      }),
      propertyParams()
    )
  })
})
