import type { MosaicStore, MosaicTarget, PlateSolver, SavedMosaic, SolveIO, SolveStore, StoredSolve } from '@astro/application'
import { astapCommand, type SkyFile, type SolvedField, type SolveOutcome, type SolverId, type SolveTaskFile } from '@astro/domain'

/** A light or master for sky geometry tests. */
export function skyFile(over: Partial<SkyFile> & { path: string }): SkyFile {
  return {
    targetId: 'm31',
    kind: 'light',
    capturedAt: new Date('2026-10-01T22:00:00Z'),
    folder: over.path.replace(/[\\/][^\\/]*$/, ''),
    exposureSec: 10,
    sizeBytes: 4_000_000,
    widthPx: 1080,
    heightPx: 1920,
    optics: { focalMm: 250, pixelUm: 2.9 },
    wcs: null,
    ...over
  }
}

/** A field centred somewhere, the Seestar S50's size and scale by default. */
export function solvedField(raDeg: number, decDeg: number, over: Partial<SolvedField> = {}): SolvedField {
  return { raDeg, decDeg, rotationDeg: 0, scaleArcsec: 2.39, widthPx: 1080, heightPx: 1920, ...over }
}

/** A solver that answers from a table by file path, running one program per solve so cancelling can be tested. */
export class FakePlateSolver implements PlateSolver {
  readonly outcomes = new Map<string, SolveOutcome>()
  readonly solved: string[] = []
  constructor(readonly id: SolverId = 'astap') {}

  answer(path: string, outcome: SolveOutcome): this {
    this.outcomes.set(path, outcome)
    return this
  }

  async solve(program: string, file: SolveTaskFile, workDir: string, io: SolveIO): Promise<SolveOutcome> {
    this.solved.push(file.path)
    const run = await io.run(astapCommand(program, `${workDir}/solve.fit`, file.hint, null))
    if (run.exitCode === null) return { ok: false, reason: 'Stopped.' }
    return this.outcomes.get(file.path) ?? { ok: false, reason: 'ASTAP found no solution.' }
  }
}

export class InMemorySolveStore implements SolveStore {
  readonly all: SkyFile[] = []
  readonly stored = new Map<string, StoredSolve>()

  add(...files: SkyFile[]): this {
    this.all.push(...files)
    return this
  }

  async files(targetId?: string): Promise<SkyFile[]> {
    return this.all.filter(f => targetId === undefined || f.targetId === targetId).sort((a, b) => a.path.localeCompare(b.path))
  }

  async solves(paths?: string[]): Promise<StoredSolve[]> {
    const all = [...this.stored.values()].sort((a, b) => a.path.localeCompare(b.path))
    return paths === undefined ? all : all.filter(s => paths.includes(s.path))
  }

  async save(solve: StoredSolve): Promise<void> {
    this.stored.set(solve.path, { ...solve, field: solve.field ? { ...solve.field } : null })
  }
}

export class InMemoryMosaicStore implements MosaicStore {
  readonly targets = new Map<string, MosaicTarget>()
  readonly saved = new Map<string, SavedMosaic>()
  /** part_of_mosaic links, as [panel target, mosaic target]. */
  readonly links: [string, string][] = []

  addTarget(target: Partial<MosaicTarget> & { id: string; name: string }): this {
    this.targets.set(target.id, { raHours: null, decDeg: null, sizeArcmin: null, goalSec: null, ...target })
    return this
  }

  async target(targetId: string): Promise<MosaicTarget | null> {
    return this.targets.get(targetId) ?? null
  }

  async plan(targetId: string): Promise<SavedMosaic | null> {
    return this.saved.get(targetId) ?? null
  }

  async plans(): Promise<SavedMosaic[]> {
    return [...this.saved.values()].sort((a, b) => a.targetId.localeCompare(b.targetId))
  }

  async savePlan(plan: SavedMosaic): Promise<void> {
    this.saved.set(plan.targetId, plan)
  }

  async linkPanels(targetId: string, panelTargetIds: string[]): Promise<void> {
    const linked = new Set(await this.linked(targetId))
    for (const other of panelTargetIds) if (other !== targetId && !linked.has(other)) this.links.push([other, targetId])
  }

  async linked(targetId: string): Promise<string[]> {
    return [...new Set(this.links.filter(l => l.includes(targetId)).map(([a, b]) => (a === targetId ? b : a)))].sort()
  }
}
