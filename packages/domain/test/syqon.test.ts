import { describe, it, expect } from 'vitest'
import { parseLiveProgress, parseSyqonModels, SYQON_KNOWN_MODELS, syqonCommand, syqonModelsFor, syqonNeededBytes, syqonOutputPath, toolSpec } from '@astro/domain'

describe('SyQon CLI', () => {
  it('[HUB-006] Given the tool catalogue, When SyQon is read, Then it is looked for in its own documented order and is optional', () => {
    const spec = toolSpec('syqon')
    expect(spec.order).toEqual(['setting', 'env', 'standard', 'registry'])
    expect(spec.envVar).toBe('SYQON_CLI_PATH')
    expect(spec.appPaths).toBe('syqon-cli.exe')
    expect(spec.standard.windows).toEqual(['%LOCALAPPDATA%/Programs/SyQon Studio/syqon-cli.exe', '%ProgramFiles%/SyQon Studio/syqon-cli.exe'])
    expect(spec.optional).toBe(true)
  })

  it('[NFR-017] Given the hub describes SyQon, When its purpose is read, Then it says the app runs the installed CLI and never ships it', () => {
    expect(toolSpec('syqon').purpose).toMatch(/never ships it/)
    expect(toolSpec('syqon').purpose).toMatch(/noncommercial/)
  })

  it('[HUB-007] Given --list-models output with a header, comments, padding and separators, When parsed, Then each model has its availability and step', () => {
    const out = [
      'ID               STATUS       DESCRIPTION',
      '# models for leigh',
      '',
      'axiom-mini       available    Star separation (free with an account)',
      'parallax-nano    Available    Sharpening',
      'prism-essential | locked | Denoise',
      '  - deep-gradient: included',
      'nova-x\tunavailable\tNoise reduction pro',
      'stellar-q        yes          Star removal, fast',
      'mystery          ready',
      'axiom-mini       locked       duplicate line',
      '----------'
    ].join('\r\n')
    const models = parseSyqonModels(out)
    expect(models.map(m => [m.id, m.available, m.step])).toEqual([
      ['axiom-mini', true, 'star-separation'],
      ['parallax-nano', true, 'sharpen'],
      ['prism-essential', false, 'denoise'],
      ['deep-gradient', true, 'gradient'],
      ['nova-x', false, 'denoise'],
      ['stellar-q', true, 'star-separation'],
      ['mystery', true, null]
    ])
    expect(models[2].status).toBe('locked')
    expect(parseSyqonModels('lonely')).toEqual([{ id: 'lonely', available: false, status: 'unknown', step: null, description: '' }])
    expect(parseSyqonModels('')).toEqual([])
  })

  it('[HUB-007] Given listed models, When a step offers them, Then only available models for that step come, known ids first', () => {
    const models = parseSyqonModels('zeta-stars available star separation\naxiom-mini available\nprism-essential locked\nmystery ready')
    expect(syqonModelsFor('star-separation', models).map(m => m.id)).toEqual(['axiom-mini', 'zeta-stars'])
    expect(syqonModelsFor('denoise', models)).toEqual([])
    expect(Object.keys(SYQON_KNOWN_MODELS)).toEqual(['axiom-mini', 'parallax-nano', 'prism-essential', 'deep-gradient'])
  })

  it('[HUB-011] Given a stack, When a step is built, Then the output sits beside it named for the step and the arguments are an array', () => {
    expect(syqonOutputPath('D:\\work\\M 31\\result_3600s.fit', 'star-separation')).toBe('D:\\work\\M 31\\result_3600s_starless.fit')
    expect(syqonOutputPath('/stacks/m42.v2.fits', 'gradient')).toBe('/stacks/m42.v2_gradient-removed.fits')
    expect(syqonOutputPath('/stacks/noext', 'denoise')).toBe('/stacks/noext_denoised.fit')
    const cmd = syqonCommand({ program: 'C:/SyQon/syqon-cli.exe', model: 'axiom-mini', input: 'D:/s/a b.fit', output: 'D:/s/a b_starless.fit', overwrite: false })
    expect(cmd).toEqual({ program: 'C:/SyQon/syqon-cli.exe', args: ['--model', 'axiom-mini', '--input', 'D:/s/a b.fit', '--output', 'D:/s/a b_starless.fit'], cwd: 'D:/s' })
    expect(syqonNeededBytes(1000)).toBe(1000)
  })

  it('[HUB-014] Given an output the user chose to replace, When the step is built, Then the overwrite flag is passed; otherwise never', () => {
    const base = { program: 'p', model: 'm', input: '/a.fit', output: '/a_x.fit' }
    expect(syqonCommand({ ...base, overwrite: true }).args).toContain('--overwrite')
    expect(syqonCommand({ ...base, overwrite: false }).args).not.toContain('--overwrite')
  })

  it('[HUB-011] Given stderr from a run, When read, Then a simple percentage is the progress, else the last line is shown', () => {
    expect(parseLiveProgress('Loading model\nProcessing tiles  42%\n')).toEqual({ percent: 42, line: 'Processing tiles  42%' })
    expect(parseLiveProgress('\r 10.5 %\r 63.5 %')).toEqual({ percent: 63.5, line: '63.5 %' })
    expect(parseLiveProgress('tile 3/9 done')).toEqual({ percent: null, line: 'tile 3/9 done' })
    expect(parseLiveProgress('999%')?.percent).toBe(100)
    expect(parseLiveProgress('\n\n')).toBeNull()
    expect(parseLiveProgress('x'.repeat(300))?.line).toHaveLength(200)
  })
})
