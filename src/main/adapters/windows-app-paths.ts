import { execFile } from 'child_process'
import type { AppPathsRegistry } from '@astro/application'

/** Runs a program with an argument array and gives back what it printed; rejects when it fails. */
export type ExecFile = (program: string, args: string[]) => Promise<string>

const execFileText: ExecFile = (program, args) =>
  new Promise((resolve, reject) => {
    execFile(program, args, { windowsHide: true, timeout: 5000, encoding: 'utf8', shell: false }, (error, stdout) => (error ? reject(error) : resolve(stdout)))
  })

const HIVES = ['HKLM', 'HKCU'] as const

/**
 * The Windows App Paths key read with `reg query`, run with an argument array (never a shell):
 * the default value of `<hive>\Software\Microsoft\Windows\CurrentVersion\App Paths\<exe>`, HKLM
 * first, then HKCU. Off Windows, or when a key is not there, nothing is found.
 */
export class WindowsAppPathsRegistry implements AppPathsRegistry {
  private readonly recent = new Map<string, { at: number; paths: Promise<string[]> }>()

  constructor(
    private readonly windows = process.platform === 'win32',
    private readonly exec: ExecFile = execFileText,
    private readonly now: () => number = Date.now,
    /** How long a lookup is reused, since every page that finds tools asks again. */
    private readonly lifetimeMs = 30_000
  ) {}

  lookup(exeName: string): Promise<string[]> {
    if (!this.windows || !/^[\w .-]+\.exe$/i.test(exeName)) return Promise.resolve([])
    const key = exeName.toLowerCase()
    const hit = this.recent.get(key)
    if (hit && this.now() - hit.at < this.lifetimeMs) return hit.paths
    const paths = this.query(exeName)
    this.recent.set(key, { at: this.now(), paths })
    return paths
  }

  /** Both hives at once; HKLM's value still comes first. */
  private async query(exeName: string): Promise<string[]> {
    const values = await Promise.all(
      HIVES.map(hive =>
        this.exec('reg', ['query', `${hive}\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`, '/ve']).then(defaultValue, () => null) // No such key in this hive.
      )
    )
    return values.filter((v, i): v is string => v !== null && values.indexOf(v) === i)
  }
}

/** The default value from `reg query ... /ve` output: "    (Default)    REG_SZ    C:\...\syqon-cli.exe". */
export function defaultValue(output: string): string | null {
  for (const line of output.split(/\r?\n/)) {
    const m = /^\s*\(.+?\)\s+REG_(?:EXPAND_)?SZ\s+(.+?)\s*$/.exec(line)
    if (m) return m[1].replace(/^"(.*)"$/, '$1')
  }
  return null
}
