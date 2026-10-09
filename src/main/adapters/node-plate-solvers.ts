import fs from 'fs'
import path from 'path'
import type { PlateSolver, SolveIO } from '@astro/application'
import {
  astapCommand,
  astapExitReason,
  astapResultPath,
  parseAstapResult,
  parseSirilSolve,
  scaleFromOptics,
  sirilSolveCommand,
  sirilSolveScript,
  solveCopyName,
  type SolveOutcome,
  type SolveTaskFile
} from '@astro/domain'

/** Every file a solve leaves in the work folder starts with this name (the copy, ASTAP's .ini and .wcs, Siril's script). */
const SOLVE_PREFIX = 'solve.'

/**
 * Puts the file in the work folder as a hard link (same disk, no space used) or else a copy, so
 * the solver and its result files never touch the source folder (NFR-018). Neither solver is
 * asked to write into the image: ASTAP writes .ini and .wcs beside it and Siril saves nothing.
 */
async function stage(source: string, workDir: string): Promise<string> {
  await fs.promises.mkdir(workDir, { recursive: true })
  await clear(workDir)
  const copy = path.join(workDir, solveCopyName(source))
  try {
    await fs.promises.link(source, copy)
  } catch {
    await fs.promises.copyFile(source, copy)
  }
  return copy
}

/** Removes what a solve left in the work folder: only files named solve.*. */
async function clear(workDir: string): Promise<void> {
  const names = await fs.promises.readdir(workDir).catch(() => [] as string[])
  await Promise.all(names.filter(n => n.startsWith(SOLVE_PREFIX)).map(n => fs.promises.rm(path.join(workDir, n), { force: true })))
}

async function solving(file: SolveTaskFile, workDir: string, work: (copy: string) => Promise<SolveOutcome>): Promise<SolveOutcome> {
  let copy: string
  try {
    copy = await stage(file.path, workDir)
  } catch (error) {
    return { ok: false, reason: `The file could not be placed in the work folder to solve: ${error instanceof Error ? error.message : String(error)}` }
  }
  try {
    return await work(copy)
  } finally {
    await clear(workDir)
  }
}

/** ASTAP's command line: solves the copy and reads the .ini it writes beside it. */
export class AstapPlateSolver implements PlateSolver {
  readonly id = 'astap' as const

  async solve(program: string, file: SolveTaskFile, workDir: string, io: SolveIO): Promise<SolveOutcome> {
    return solving(file, workDir, async copy => {
      const heightDeg = file.optics ? (file.heightPx * scaleFromOptics(file.optics)) / 3600 : null
      const run = await io.run(astapCommand(program, copy, file.hint, heightDeg))
      const ini = await fs.promises.readFile(astapResultPath(copy), 'utf8').catch(() => null)
      const outcome: SolveOutcome = ini === null ? { ok: false, reason: run.error ?? astapExitReason(run.exitCode) } : parseAstapResult(ini, file.widthPx, file.heightPx)
      // Exit code 1 is ASTAP's "no solution": it searched and matched nothing.
      return !outcome.ok && run.exitCode === 1 && !run.error ? { ...outcome, noSolution: true } : outcome
    })
  }
}

/** Siril's own solver: a three-line script run from the work folder, read back from its log. */
export class SirilPlateSolver implements PlateSolver {
  readonly id = 'siril' as const

  async solve(program: string, file: SolveTaskFile, workDir: string, io: SolveIO): Promise<SolveOutcome> {
    return solving(file, workDir, async copy => {
      const script = path.join(workDir, `${SOLVE_PREFIX}ssf`)
      await fs.promises.writeFile(script, sirilSolveScript(path.basename(copy), file.hint, file.optics), 'utf8')
      const run = await io.run(sirilSolveCommand(program, workDir, script))
      const outcome = parseSirilSolve(run.output, file.widthPx, file.heightPx)
      if (!outcome.ok && run.exitCode !== 0 && /without printing/.test(outcome.reason)) {
        return { ok: false, reason: run.error ?? `Siril stopped without a solution (exit code ${run.exitCode ?? 'unknown'}).` }
      }
      return outcome
    })
  }
}
