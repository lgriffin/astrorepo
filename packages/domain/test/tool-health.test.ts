import { describe, it, expect } from 'vitest'
import {
  astapCatalogues,
  buildPostProcessRecipe,
  catalogueBlock,
  catalogueFiles,
  catalogueSpec,
  catalogueStatus,
  CATALOGUES,
  blockingMissing,
  missingCatalogues,
  parseToolVersion,
  postProcessCatalogues,
  TOOLS,
  toolSpec,
  type CatalogueStatus,
  type RecipeInput
} from '@astro/domain'

describe('Tool versions', () => {
  it('[HUB-008] Given what tools print for their version flag, When read, Then the first dotted number is the version', () => {
    expect(parseToolVersion('siril 1.4.0-beta2\n')).toBe('1.4.0-beta2')
    expect(parseToolVersion('GNU bash, version 5.2.37(1)-release (x86_64-pc-msys)')).toBe('5.2.37')
    expect(parseToolVersion('syqon-cli v2.3.1\nCopyright SyQon')).toBe('2.3.1')
    expect(parseToolVersion('Usage: tool [options]')).toBeNull()
    expect(parseToolVersion('')).toBeNull()
  })

  it('[HUB-008] Given the catalogue of tools, When their version flags are read, Then only tools with a trusted flag have one and none is a shell string', () => {
    expect(toolSpec('siril').versionArgs).toEqual(['--version'])
    expect(toolSpec('syqon').versionArgs).toEqual(['--version'])
    expect(toolSpec('rc-astro').versionArgs).toBeNull()
    expect(toolSpec('astap').versionArgs).toBeNull()
    // Siril_Scripts' entry starts processing, so it is never run to ask.
    expect(toolSpec('siril-scripts').versionArgs).toBeNull()
    for (const t of TOOLS) for (const a of t.versionArgs ?? []) expect(a).not.toMatch(/\s/)
  })
})

describe('Catalogues', () => {
  it('[HUB-015] Given a folder listing with ASTAP database files, When read, Then each database is named with its file count, other files ignored', () => {
    const listing = ['d50_0101.1476', 'd50_0102.1476', 'H18_3502.1476', 'h17_0101.290', 'astap.exe', 'readme.txt', 'd50_0101.1476.bak', 'C:\\astap\\g17_0001.290']
    expect(astapCatalogues(listing)).toEqual([
      { name: 'D50', files: 2 },
      { name: 'G17', files: 1 },
      { name: 'H17', files: 1 },
      { name: 'H18', files: 1 }
    ])
    expect(astapCatalogues([])).toEqual([])
  })

  it("[HUB-009] Given folder listings, When a catalogue's files are picked, Then Siril's Gaia XP files and RC Astro's models are recognised", () => {
    expect(catalogueFiles('siril-spcc', ['siril_cat1_healpix8_xpsamp_12.dat', 'siril_cat2_healpix8_astro.dat', 'notes.dat'])).toEqual(['siril_cat1_healpix8_xpsamp_12.dat'])
    expect(catalogueFiles('rc-astro-models', ['rc-astro.exe', 'BlurXTerminator.4.pb', 'StarXTerminator.lite.nonoise.11.pb', 'noisexterminator.3.onnx'])).toEqual([
      'BlurXTerminator.4.pb',
      'StarXTerminator.lite.nonoise.11.pb',
      'noisexterminator.3.onnx'
    ])
    expect(catalogueFiles('astap-stars', ['d50_0101.1476', 'astap.exe'])).toEqual(['d50_0101.1476'])
  })

  it('[HUB-009] Given a found tool, When its catalogue is checked, Then it is installed in the first folder holding it, or missing with every folder looked in', () => {
    const astap = catalogueSpec('astap-stars')
    const present = catalogueStatus(astap, { path: 'C:/astap/astap.exe' }, [
      { dir: 'D:/stars', names: null },
      { dir: 'C:/astap', names: ['astap.exe', 'd50_0101.1476', 'd50_0102.1476'] }
    ])
    expect(present).toMatchObject({ state: 'present', dir: 'C:/astap', found: 'D50 (2 files)', looked: [] })
    const one = catalogueStatus(catalogueSpec('siril-spcc'), { path: 'siril' }, [{ dir: 'S', names: ['siril_cat1_healpix8_xpsamp_1.dat'] }])
    expect(one.found).toBe('1 file')
    const missing = catalogueStatus(astap, { path: 'C:/astap/astap.exe' }, [{ dir: 'C:/astap', names: ['astap.exe'] }, { dir: 'C:/Program Files/astap', names: null }])
    expect(missing).toMatchObject({ state: 'missing', dir: null, looked: ['C:/astap', 'C:/Program Files/astap'] })
    expect(missingCatalogues([present, missing]).map(c => c.state)).toEqual(['missing'])
  })

  it('[HUB-009] Given a tool that is not found, When its catalogue is checked, Then it is not checked rather than missing', () => {
    expect(catalogueStatus(catalogueSpec('astap-stars'), null, [])).toMatchObject({ state: 'not-checked', looked: [] })
    expect(catalogueStatus(catalogueSpec('rc-astro-models'), { path: null }, [])).toMatchObject({ state: 'not-checked' })
    expect(CATALOGUES.map(c => c.tool)).toEqual(['astap', 'siril', 'rc-astro'])
    expect(() => catalogueSpec('nope' as never)).toThrow()
  })

  const status = (over: Partial<CatalogueStatus>): CatalogueStatus => ({ id: 'siril-spcc', tool: 'siril', label: "Siril's Gaia SPCC catalogue", state: 'present', dir: 'x', found: '1 file', looked: [], ...over })

  it('[HUB-010] Given missing catalogues, When a step needs them, Then the block names the blocking ones; optional ones and ones it does not need are ignored', () => {
    expect(postProcessCatalogues(true)).toEqual(['rc-astro-models'])
    expect(postProcessCatalogues(false)).toEqual([])
    expect(blockingMissing([status({ state: 'missing' }), status({ id: 'rc-astro-models', tool: 'rc-astro', label: 'RC Astro model files', state: 'missing' })]).map(s => s.id)).toEqual([])
    const spcc = status({ state: 'missing' })
    const models = status({ id: 'rc-astro-models', tool: 'rc-astro', label: 'RC Astro model files', state: 'missing' })
    const stars = status({ id: 'astap-stars', tool: 'astap', label: 'ASTAP star database', state: 'missing' })
    expect(blockingMissing([stars, models]).map(s => s.id)).toEqual(['astap-stars'])
    expect(catalogueBlock(['astap-stars'], [spcc, stars])).toBe('Needs ASTAP star database, which is not installed. Install it, or set its folder in Settings, under Tools.')
    expect(catalogueBlock(['siril-spcc', 'rc-astro-models'], [spcc, models])).toBeNull()
    expect(catalogueBlock(['siril-spcc'], [spcc, stars])).toBeNull()
    expect(catalogueBlock(['siril-spcc'], [status({}), stars])).toBeNull()
    expect(catalogueBlock(['siril-spcc'], [status({ state: 'not-checked' })])).toBeNull()
  })

  it('[HUB-010] Given RC Astro found but its models not found, When the post-processing recipe is built, Then they block nothing, since their file names are not confirmed', () => {
    const tools = TOOLS.map(t => ({ id: t.id, path: t.id === 'rc-astro' || t.id === 'siril' || t.id === 'siril-scripts' || t.id === 'bash' ? t.standard.windows[0] ?? 'x' : null, source: null, settingMissing: false, looked: [] }))
    const input: RecipeInput = {
      stack: { path: 'D:/work/M31/result.fit', sizeBytes: 0, width: 100, height: 100, colour: true, focalMm: 250, pixelUm: 2.9 },
      target: { name: 'M 31', objectType: 'galaxy', raHours: 0.7, decDeg: 41 },
      tools,
      windows: true,
      freeBytes: 1e12,
      inReadOnlyFolder: false,
      catalogues: [status({}), status({ id: 'rc-astro-models', tool: 'rc-astro', label: 'RC Astro model files', state: 'missing' })]
    }
    expect(buildPostProcessRecipe(input).missingCatalogues).toBeNull()
    expect(buildPostProcessRecipe({ ...input, tools: tools.map(t => (t.id === 'rc-astro' ? { ...t, path: null } : t)) }).missingCatalogues).toBeNull()
    expect(buildPostProcessRecipe({ ...input, catalogues: undefined }).missingCatalogues).toBeNull()
  })
})

describe('Tool versions and catalogues, edge by edge', () => {
  it('[HUB-008] Given version output on a later line, with build suffixes or a bare number, When read, Then the first dotted number on any line is taken whole', () => {
    expect(parseToolVersion('Usage: astap\r\nastap version 2024.05.01')).toBe('2024.05.01')
    expect(parseToolVersion('tool v1.2.3+build.7 (x64)')).toBe('1.2.3+build.7')
    expect(parseToolVersion('Siril 1.2.6')).toBe('1.2.6')
    expect(parseToolVersion('rc 10.20')).toBe('10.20')
    expect(parseToolVersion('build 42 only')).toBeNull()
    expect(parseToolVersion('first line\nsecond 3.4\nthird 5.6')).toBe('3.4')
  })

  it('[HUB-015] Given ASTAP files in nested folders, with other extensions or names, When read, Then only the database files count, by their own names, sorted', () => {
    expect(
      astapCatalogues(['/opt/astap/w08_0101.290', 'C:\\astap\\D05_0001.1476', 'x_d50_0101.1476', 'd50_0101.1476x', 'd5_0101.1476', 'dd0_0101.1476', 'd50-0101.1476', 'd50_.1476', 'd50_0101.290', 'd50_0102.1476'])
    ).toEqual([
      { name: 'D05', files: 1 },
      { name: 'D50', files: 2 },
      { name: 'W08', files: 1 }
    ])
  })

  it('[HUB-009] Given catalogue files in nested folders, near misses and odd cases, When picked, Then only whole matching file names count', () => {
    expect(catalogueFiles('siril-spcc', ['/home/l/.local/share/siril/catalogue/SIRIL_CAT1_XPSAMP_3.DAT', 'x_siril_cat1_xpsamp.dat', 'siril_cat1_xpsamp.dat.part', 'siril_cat1_astro.dat', 'C:\\siril\\siril_cat2_xpsamp_9.dat'])).toEqual([
      '/home/l/.local/share/siril/catalogue/SIRIL_CAT1_XPSAMP_3.DAT',
      'C:\\siril\\siril_cat2_xpsamp_9.dat'
    ])
    expect(
      catalogueFiles('rc-astro-models', ['models/BlurXTerminator.onnx', 'C:\\RC\\starxterminator.mlpackage', 'NoiseXTerminator.2.mlmodel', 'nxt.bin', 'BlurXTerminator.4.pb.bak', 'StarXTerminator.11.bin', 'BlurXTerminator.txt'])
    ).toEqual(['models/BlurXTerminator.onnx', 'C:\\RC\\starxterminator.mlpackage', 'NoiseXTerminator.2.mlmodel', 'StarXTerminator.11.bin'])
    expect(catalogueFiles('astap-stars', ['C:/astap/h18_0101.1476', 'readme.txt'])).toEqual(['C:/astap/h18_0101.1476'])
  })

  it('[HUB-009] Given several databases, a single one-file database or other catalogues, When their status is found, Then what was found is spelled out', () => {
    const astap = catalogueSpec('astap-stars')
    expect(catalogueStatus(astap, { path: 'a' }, [{ dir: 'A', names: ['d50_0101.1476', 'd50_0102.1476', 'h18_0101.1476', 'other.txt'] }])).toEqual({
      id: 'astap-stars',
      tool: 'astap',
      label: 'ASTAP star database',
      state: 'present',
      dir: 'A',
      found: 'D50 (2 files), H18 (1 file)',
      looked: []
    })
    expect(catalogueStatus(catalogueSpec('rc-astro-models'), { path: 'r' }, [{ dir: 'R', names: ['BlurXTerminator.4.pb', 'NoiseXTerminator.3.pb'] }]).found).toBe('2 files')
    expect(catalogueStatus(astap, { path: 'a' }, [{ dir: 'A', names: [] }, { dir: 'B', names: ['h18_0101.1476'] }, { dir: 'C', names: ['d50_0101.1476'] }])).toMatchObject({ dir: 'B', found: 'H18 (1 file)' })
    expect(catalogueStatus(astap, null, [{ dir: 'A', names: ['d50_0101.1476'] }])).toEqual({ id: 'astap-stars', tool: 'astap', label: 'ASTAP star database', state: 'not-checked', dir: null, found: null, looked: [] })
    expect(catalogueStatus(astap, { path: 'a' }, [])).toEqual({ id: 'astap-stars', tool: 'astap', label: 'ASTAP star database', state: 'missing', dir: null, found: null, looked: [] })
    expect(catalogueSpec('siril-spcc').id).toBe('siril-spcc')
    expect(() => catalogueSpec('nope' as never)).toThrow('Unknown catalogue nope')
  })

  const missing = (label: string): CatalogueStatus => ({ id: 'astap-stars', tool: 'astap', label, state: 'missing', dir: null, found: null, looked: [] })

  it('[HUB-010] Given two or three blocking catalogues missing, or one whose name is plural, When a step needs them, Then the refusal lists them and agrees in number', () => {
    expect(catalogueBlock(['astap-stars'], [missing('A'), missing('B')])).toBe('Needs A and B, which are not installed. Install them, or set their folders in Settings, under Tools.')
    expect(catalogueBlock(['astap-stars'], [missing('A'), missing('B'), missing('C')])).toBe('Needs A, B and C, which are not installed. Install them, or set their folders in Settings, under Tools.')
    expect(catalogueBlock(['astap-stars'], [missing('Star files')])).toBe('Needs Star files, which are not installed. Install them, or set its folder in Settings, under Tools.')
    expect(catalogueBlock([], [missing('A')])).toBeNull()
    expect(missingCatalogues([missing('A'), { ...missing('B'), state: 'not-checked' }, { ...missing('C'), state: 'present' }]).map(s => s.label)).toEqual(['A'])
    expect(blockingMissing([{ ...missing('B'), state: 'present' }])).toEqual([])
  })
})
