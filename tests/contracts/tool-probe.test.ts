import { describe, expect, it } from 'vitest'
import { FakeAppPathsRegistry, FakeToolProbe } from '@astro/testkit'
import { appPathsRegistryContract, toolProbeContract } from '@astro/testkit/contracts/tool-probe.contract'
import { NodeToolProbe } from '../../src/main/adapters/node-tool-probe'
import { defaultValue, WindowsAppPathsRegistry } from '../../src/main/adapters/windows-app-paths'

toolProbeContract('fake', () => {
  const probe = new FakeToolProbe().answer('siril-cli', ['--version'], { stdout: 'siril 1.4.0' }).answer('syqon-cli', ['--list-models'], { exitCode: 4 })
  return { probe, seed: { version: { program: 'siril-cli', args: ['--version'], prints: '1.4.0' }, failing: { program: 'syqon-cli', args: ['--list-models'] }, missing: 'nowhere' } }
})

toolProbeContract('Node', () => ({
  probe: new NodeToolProbe(),
  seed: {
    version: { program: process.execPath, args: ['-e', "process.stdout.write('tool 2.3.1')"], prints: '2.3.1' },
    failing: { program: process.execPath, args: ['-e', 'process.exit(4)'] },
    missing: '/no/such/program-astrorepo'
  }
}))

appPathsRegistryContract('fake', () => new FakeAppPathsRegistry().register('syqon-cli.exe', 'C:\\SyQon\\syqon-cli.exe'))

/** `reg query` as Windows prints it, for the keys this pretend registry holds. */
const REG_OUTPUT = (value: string) => `\r\nHKEY_LOCAL_MACHINE\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\syqon-cli.exe\r\n    (Default)    REG_SZ    ${value}\r\n\r\n`

appPathsRegistryContract('Windows (reg query)', () =>
  new WindowsAppPathsRegistry(true, async (program, args) => {
    if (program !== 'reg' || args[0] !== 'query' || args[2] !== '/ve') throw new Error('unexpected command')
    if (args[1] === 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\syqon-cli.exe') return REG_OUTPUT('C:\\SyQon\\syqon-cli.exe')
    if (args[1] === 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\syqon-cli.exe') return REG_OUTPUT('"C:\\SyQon\\syqon-cli.exe"')
    throw new Error('ERROR: The system was unable to find the specified registry key or value.')
  })
)

describe('WindowsAppPathsRegistry', () => {
  it('[HUB-006] Given reg query output, When read, Then the default value is the path, quoted or not, plain or expandable', () => {
    expect(defaultValue('    (Default)    REG_SZ    C:\\Program Files\\SyQon Studio\\syqon-cli.exe')).toBe('C:\\Program Files\\SyQon Studio\\syqon-cli.exe')
    expect(defaultValue('    (Standard)    REG_EXPAND_SZ    "%LOCALAPPDATA%\\Programs\\SyQon Studio\\syqon-cli.exe"')).toBe('%LOCALAPPDATA%\\Programs\\SyQon Studio\\syqon-cli.exe')
    expect(defaultValue('    Path    REG_SZ    C:\\x')).toBeNull()
    expect(defaultValue('')).toBeNull()
  })

  it('[HUB-006] Given another hive also registering it, When looked up, Then HKCU adds what HKLM lacks; off Windows, or for an odd name, reg is never run', async () => {
    const calls: string[][] = []
    const hkcuOnly = new WindowsAppPathsRegistry(true, async (_p, args) => {
      calls.push(args)
      if (args[1].startsWith('HKCU')) return REG_OUTPUT('D:\\Mine\\syqon-cli.exe')
      throw new Error('missing')
    })
    expect(await hkcuOnly.lookup('syqon-cli.exe')).toEqual(['D:\\Mine\\syqon-cli.exe'])
    expect(calls.map(a => a[1].slice(0, 4))).toEqual(['HKLM', 'HKCU'])
    let ran = false
    const exec = async () => ((ran = true), '')
    expect(await new WindowsAppPathsRegistry(false, exec).lookup('syqon-cli.exe')).toEqual([])
    expect(await new WindowsAppPathsRegistry(true, exec).lookup('x.exe & calc')).toEqual([])
    expect(ran).toBe(false)
  })

  it('[HUB-006] Given this machine, When the default registry is asked off Windows, Then nothing is found and nothing runs', async () => {
    if (process.platform === 'win32') return
    expect(await new WindowsAppPathsRegistry().lookup('syqon-cli.exe')).toEqual([])
  })
})

describe('NodeToolProbe', () => {
  it('[NFR-017] Given a tool that does not answer, When probed, Then it is stopped at the time limit and says so', async () => {
    const result = await new NodeToolProbe(200).run(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'])
    expect(result.exitCode).toBeNull()
    expect(result.error).toBe('It did not answer within 1 second.')
  })

  it('[NFR-017] Given arguments holding shell characters, When probed, Then the tool receives them literally', async () => {
    const odd = 'D:/100% M42 & echo $(id) `x` "q"'
    const result = await new NodeToolProbe().run(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', odd])
    expect(result.stdout).toBe(odd)
  })
})
