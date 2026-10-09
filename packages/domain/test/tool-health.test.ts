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
