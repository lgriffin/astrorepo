import { describe, expect, it } from 'vitest'
import type { AppPathsRegistry, ToolProbe } from '@astro/application'

export interface ProbeSeed {
  /** A program that prints `version` on stdout and exits 0 when run with `args`. */
  version: { program: string; args: string[]; prints: string }
  /** A program that exits with code 4 when run with `args`. */
  failing: { program: string; args: string[] }
  /** A program that is not there. */
  missing: string
}

/** Every ToolProbe adapter must pass this suite (NFR-017). */
export function toolProbeContract(adapterName: string, make: () => { probe: ToolProbe; seed: ProbeSeed }): void {
  describe(`ToolProbe contract: ${adapterName}`, () => {
    it('[NFR-017] Given a tool that prints its version, When probed with its arguments, Then its output and exit code come back', async () => {
      const { probe, seed } = make()
      const result = await probe.run(seed.version.program, seed.version.args)
      expect(result).toMatchObject({ exitCode: 0, error: null })
      expect(result.stdout).toContain(seed.version.prints)
    })

    it('[NFR-017] Given a tool that fails, When probed, Then its exit code comes back with no error', async () => {
      const { probe, seed } = make()
      expect(await probe.run(seed.failing.program, seed.failing.args)).toMatchObject({ exitCode: 4, error: null })
    })

    it('[NFR-017] Given a program that is not there, When probed, Then there is no exit code and an error in a sentence', async () => {
      const { probe, seed } = make()
      const result = await probe.run(seed.missing, ['--version'])
      expect(result.exitCode).toBeNull()
      expect(result.error).toMatch(/^[A-Z].*\.$/)
    })
  })
}

/** Every AppPathsRegistry adapter must pass this suite. `make` registers `C:\SyQon\syqon-cli.exe` for syqon-cli.exe. */
export function appPathsRegistryContract(adapterName: string, make: () => AppPathsRegistry): void {
  describe(`AppPathsRegistry contract: ${adapterName}`, () => {
    it('[HUB-006] Given a program registered under App Paths, When looked up, Then its path comes back; an unknown one gives nothing', async () => {
      const registry = make()
      expect(await registry.lookup('syqon-cli.exe')).toEqual(['C:\\SyQon\\syqon-cli.exe'])
      expect(await registry.lookup('nothing-here.exe')).toEqual([])
    })
  })
}
