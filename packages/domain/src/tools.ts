/**
 * The tool hub: the external programs the app hands work to, where to look for each, and where
 * Leigh's Siril_Scripts v2 expects them. Pure data and rules; finding files is an adapter's job.
 */

export type ToolId = 'siril' | 'siril-scripts' | 'rc-astro' | 'bash'

export interface ToolSpec {
  id: ToolId
  label: string
  /** What the app uses it for, in the user's words. */
  purpose: string
  /** app_settings key holding the user's own path, which wins over every other place. */
  settingKey: string
  /** Program names to look for on PATH, per platform. */
  onPath: { windows: string[]; other: string[] }
  /** Standard install locations, per platform (forward slashes; `~` is the home folder). */
  standard: { windows: string[]; other: string[] }
  /** Only Windows needs it (Git Bash runs Siril_Scripts' shell script there). */
  windowsOnly?: boolean
}

/** Siril_Scripts v2 is a folder; the hub reports its entry script inside it. */
export const SIRIL_SCRIPTS_ENTRY = { windows: 'v2/postprocess.bat', other: 'v2/postprocess.sh' } as const

export const TOOLS: readonly ToolSpec[] = [
  {
    id: 'siril',
    label: 'Siril',
    purpose: 'Stacks frames and runs every Siril step of post-processing.',
    settingKey: 'tool_path_siril',
    onPath: { windows: ['siril-cli.exe'], other: ['siril-cli', 'siril'] },
    standard: { windows: ['C:/Program Files/Siril/bin/siril-cli.exe'], other: ['/usr/bin/siril-cli', '/usr/local/bin/siril-cli', '/Applications/Siril.app/Contents/MacOS/siril-cli'] }
  },
  {
    id: 'siril-scripts',
    label: 'Siril_Scripts v2',
    purpose: 'Post-processes a stack: plate solve, colour calibration, RC Astro, stretch and export.',
    settingKey: 'tool_path_siril_scripts',
    onPath: { windows: [], other: [] },
    standard: {
      windows: ['~/Siril_Scripts', '~/Documents/Siril_Scripts', '~/source/repos/Siril_Scripts', 'C:/Siril_Scripts'],
      other: ['~/Siril_Scripts', '~/src/Siril_Scripts']
    }
  },
  {
    id: 'rc-astro',
    label: 'RC Astro CLI',
    purpose: 'BlurXTerminator, NoiseXTerminator and StarXTerminator.',
    settingKey: 'tool_path_rc_astro',
    onPath: { windows: ['rc-astro.exe'], other: ['rc-astro'] },
    standard: { windows: ['C:/Program Files/RC-Astro/CLI/rc-astro.exe'], other: ['/usr/local/bin/rc-astro', '/opt/rc-astro/rc-astro'] }
  },
  {
    id: 'bash',
    label: 'Git Bash',
    purpose: "Runs Siril_Scripts' shell script on Windows.",
    settingKey: 'tool_path_bash',
    onPath: { windows: ['bash.exe'], other: ['bash'] },
    standard: { windows: ['C:/Program Files/Git/bin/bash.exe', 'C:/Program Files (x86)/Git/bin/bash.exe'], other: ['/bin/bash'] },
    windowsOnly: true
  }
]

export type ToolSource = 'setting' | 'path' | 'standard'

export interface ToolStatus {
  id: ToolId
  /** The program (or, for Siril_Scripts, its entry script) that was found; null when not found. */
  path: string | null
  /** How it was found. */
  source: ToolSource | null
  /** The user's setting names a path that does not exist, so the hub looked elsewhere. */
  settingMissing: boolean
  /** Every place looked, in order, when nothing was found. */
  looked: string[]
}

/**
 * Siril_Scripts v2 does not search: it runs Siril and RC Astro from fixed paths
 * (postprocess.sh, lines 54 and 55).
 */
export const SIRIL_SCRIPTS_EXPECTS: Partial<Record<ToolId, string>> = {
  siril: 'C:/Program Files/Siril/bin/siril-cli.exe',
  'rc-astro': 'C:/Program Files/RC-Astro/CLI/rc-astro.exe'
}

const samePath = (a: string, b: string) => a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase()

/** Tools found somewhere Siril_Scripts v2 will not run them from (Windows only, where its paths apply). */
export function toolWarnings(statuses: ToolStatus[], windows: boolean): { id: ToolId; text: string }[] {
  if (!windows) return []
  const warnings: { id: ToolId; text: string }[] = []
  for (const s of statuses) {
    const expected = SIRIL_SCRIPTS_EXPECTS[s.id]
    if (expected && s.path && !samePath(s.path, expected)) {
      warnings.push({ id: s.id, text: `Siril_Scripts v2 runs this from ${expected}, not ${s.path}, so it will not find it there.` })
    }
  }
  return warnings
}

export function toolSpec(id: ToolId): ToolSpec {
  const spec = TOOLS.find(t => t.id === id)
  if (!spec) throw new Error(`Unknown tool ${id}`)
  return spec
}
