import { describe, it, expect } from 'vitest'
import {
  buildPostProcessRecipe,
  commandLine,
  formatCoords,
  postProcessingSpace,
  profileForObjectType,
  targetLabel,
  TOOLS,
  toolWarnings,
  type RecipeInput,
  type ToolId,
  type ToolStatus
} from '@astro/domain'

const STANDARD: Record<ToolId, string> = {
  siril: 'C:/Program Files/Siril/bin/siril-cli.exe',
  'siril-scripts': 'C:/Users/leigh/Siril_Scripts/v2/postprocess.bat',
  'rc-astro': 'C:/Program Files/RC-Astro/CLI/rc-astro.exe',
  bash: 'C:/Program Files/Git/bin/bash.exe'
}
const tools = (except: ToolId[] = [], at: Partial<Record<ToolId, string>> = {}): ToolStatus[] =>
  TOOLS.map(t => {
    const path = except.includes(t.id) ? null : (at[t.id] ?? STANDARD[t.id])
    return { id: t.id, path, source: path ? 'standard' : null, settingMissing: false, looked: [] }
  })

const input = (over: Partial<RecipeInput> = {}): RecipeInput => ({
  stack: { path: 'D:/work/siril/M 31/result_10800s.fit', sizeBytes: 0, width: 1920, height: 1080, colour: true, focalMm: 250, pixelUm: 2.9 },
  target: { name: 'M 31', objectType: 'galaxy', raHours: 0.7123, decDeg: 41.2692 },
  tools: tools(),
  windows: true,
  freeBytes: 100e9,
  inReadOnlyFolder: false,
  ...over
})

describe('post-processing profile', () => {
  it('[PPR-001] Given object types from the catalogue, When a profile is picked, Then it matches what Siril_Scripts would pick from SIMBAD', () => {
    expect(profileForObjectType('galaxy').profile).toBe('galaxy')
    expect(profileForObjectType('supernova_remnant').profile).toBe('nebula')
    expect(profileForObjectType('globular_cluster').profile).toBe('cluster')
    expect(profileForObjectType('variable_star').profile).toBe('stellar')
    expect(profileForObjectType('comet')).toEqual({ profile: 'broadband', reason: "The object type does not say, so the broadband profile, Siril_Scripts' conservative default." })
    expect(profileForObjectType('emission_nebula').reason).toBe('It is an emission nebula, so the nebula profile.')
  })

  it('[PPR-001] Given J2000 coordinates, When formatted for platesolve, Then they read HH:MM:SS.ss,±DD:MM:SS.s without rounding up to 60', () => {
    expect(formatCoords(0.7123, 41.2692)).toBe('00:42:44.28,+41:16:09.1')
    expect(formatCoords(5.5883, -5.391)).toBe('05:35:17.88,-05:23:27.6')
    expect(formatCoords(23.9999999, 0)).toBe('00:00:00.00,+00:00:00.0')
  })

  it('[PPR-001] Given a name with spaces, When used as the output label, Then the spaces are dropped', () => {
    expect(targetLabel('M 31')).toBe('M31')
    expect(targetLabel('Sh2-155 / Cave')).toBe('Sh2-155-Cave')
  })
})

describe('post-processing recipe', () => {
  it('[PPR-001] Given a galaxy stack and every tool, When the recipe is built, Then the command names the stack, target, profile, coordinates and optics', () => {
    const r = buildPostProcessRecipe(input())
    expect(r.program).toBe(STANDARD['siril-scripts'])
    expect(r.args).toEqual([
      'D:/work/siril/M 31/result_10800s.fit',
      '--target=M31',
      '--profile=galaxy',
      '--quality=normal',
      '--coords=00:42:44.28,+41:16:09.1',
      '--focal=250',
      '--pixelsize=2.9'
    ])
    expect(r.outputDir).toBe('D:/work/siril/M 31/processed/M31')
    expect(r).toMatchObject({ missing: [], skipped: [], warnings: [] })
    expect(commandLine(r.program ?? '', r.args)).toBe(
      'C:/Users/leigh/Siril_Scripts/v2/postprocess.bat "D:/work/siril/M 31/result_10800s.fit" --target=M31 --profile=galaxy --quality=normal --coords=00:42:44.28,+41:16:09.1 --focal=250 --pixelsize=2.9'
    )
  })

  it('[PPR-002] Given a profile and quality the user picked, When the recipe is built, Then the command uses them and says what the object type suggested', () => {
    const r = buildPostProcessRecipe(input({ profile: 'nebula', quality: 'strong' }))
    expect(r.args).toContain('--profile=nebula')
    expect(r.args).toContain('--quality=strong')
    expect(r.profileReason).toBe('Your choice; the object type suggests galaxy.')
  })

  it('[PPR-003] Given no RC Astro CLI, When the recipe is built, Then BXT, NXT and SXT are skipped and it says why', () => {
    const r = buildPostProcessRecipe(input({ tools: tools(['rc-astro']) }))
    expect(r.args.slice(-3)).toEqual(['--no-bxt', '--no-nxt', '--no-sxt'])
    expect(r.skipped).toEqual(['BlurXTerminator, NoiseXTerminator and StarXTerminator, because the RC Astro CLI was not found.'])
    expect(r.program).not.toBeNull()
  })

  it('[PPR-004] Given Siril or Git Bash missing on Windows, When the recipe is built, Then there is no command and the missing tools are named', () => {
    expect(buildPostProcessRecipe(input({ tools: tools(['siril', 'bash']) }))).toMatchObject({ program: null, missing: ['siril', 'bash'] })
    expect(buildPostProcessRecipe(input({ tools: tools(['bash']), windows: false })).missing).toEqual([])
  })

  it('[HUB-003] Given Siril installed away from where Siril_Scripts looks, When the recipe is built, Then it warns that the script will not find it', () => {
    const r = buildPostProcessRecipe(input({ tools: tools([], { siril: 'D:/Apps/Siril/bin/siril-cli.exe' }) }))
    expect(r.warnings).toEqual([
      'Siril_Scripts v2 runs Siril from C:/Program Files/Siril/bin/siril-cli.exe, not D:/Apps/Siril/bin/siril-cli.exe; install it there or edit the path at the top of postprocess.sh.'
    ])
  })

  it('[PPR-001] Given no coordinates or optics, When the recipe is built, Then those options are left out and it says what the script will do instead', () => {
    const r = buildPostProcessRecipe(input({
      target: { name: 'Comet', objectType: 'comet', raHours: null, decDeg: null },
      stack: { path: '/w/result.fit', sizeBytes: 0, width: 100, height: 100, colour: true, focalMm: null, pixelUm: null }
    }))
    expect(r.args.some(a => a.startsWith('--coords') || a.startsWith('--focal'))).toBe(false)
    expect(r.warnings).toHaveLength(2)
    expect(r.warnings[0]).toMatch(/SIMBAD/)
    expect(r.warnings[1]).toMatch(/250 mm and 2 µm/)
  })

  it('[PPR-006] Given a stack in a folder the app only reads, When the recipe is built, Then it warns where the script writes', () => {
    const r = buildPostProcessRecipe(input({ inReadOnlyFolder: true, stack: { ...input().stack, path: 'N:\\Astro\\M 31\\stacked\\M31.fit' } }))
    expect(r.outputDir).toBe('N:\\Astro\\M 31\\stacked\\processed\\M31')
    expect(r.warnings.at(-1)).toMatch(/^The stack is in a folder the app only reads, and Siril_Scripts writes N:\\Astro\\M 31\\stacked\\processed\\M31 beside it/)
  })

  it('[PPR-005] Given a one-megapixel colour stack, When space is estimated, Then the peak counts every float file at once and RC Astro adds four TIFFs', () => {
    expect(postProcessingSpace(1000, 1000, true, true)).toEqual({ peakBytes: 17 * 12e6 + 9e6, keptBytes: 6 * 12e6 + 9e6 })
    expect(postProcessingSpace(1000, 1000, true, false).peakBytes).toBe(13 * 12e6 + 9e6)
    expect(postProcessingSpace(1000, 1000, false, true).peakBytes).toBe(17 * 4e6 + 3e6)
  })

  it('[PPR-005] Given too little free space, When the recipe is built, Then it is short by the difference; a stack with no size in the index is approximate', () => {
    const r = buildPostProcessRecipe(input({ freeBytes: 100e6, stack: { ...input().stack, width: 1000, height: 1000 } }))
    expect(r.space).toEqual({ neededBytes: 213e6, fits: false, headroomBytes: null, shortBytes: 113e6 })
    const guessed = buildPostProcessRecipe(input({ stack: { ...input().stack, width: null, height: null, sizeBytes: 12e6 } }))
    expect(guessed).toMatchObject({ sizeApproximate: true, peakBytes: 213e6 })
  })
})

describe('tool hub warnings', () => {
  it('[HUB-003] Given tools found where Siril_Scripts looks, When checked, Then there is no warning; elsewhere, one per tool, and none off Windows', () => {
    expect(toolWarnings(tools(), true)).toEqual([])
    expect(toolWarnings(tools([], { 'rc-astro': 'C:\\Program Files\\RC-Astro\\CLI\\rc-astro.exe' }), true)).toEqual([])
    expect(toolWarnings(tools([], { 'rc-astro': 'D:/RC/rc-astro.exe' }), true).map(w => w.id)).toEqual(['rc-astro'])
    expect(toolWarnings(tools([], { 'rc-astro': '/usr/local/bin/rc-astro' }), false)).toEqual([])
  })
})
