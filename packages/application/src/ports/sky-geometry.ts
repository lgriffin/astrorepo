import type { JobCommand, MosaicPlan, SkyFile, SolvedField, SolveOutcome, SolverId, SolveSource, SolveTaskFile } from '@astro/domain'

/** How one program run of a solve ended, with everything it printed. */
export interface SolveRun {
  exitCode: number | null
  error: string | null
  output: string
}

/** What the job runner lends a solver: a way to run a program (logged, cancellable) and nothing else. */
export interface SolveIO {
  run(command: JobCommand): Promise<SolveRun>
}

/**
 * Driven port: a plate solver. It solves a copy or hard link of the file inside the work folder,
 * never the file where it lies, reads the solver's result, and removes what it made there.
 * Adapters: ASTAP's command line, and Siril's own solver.
 */
export interface PlateSolver {
  readonly id: SolverId
  solve(program: string, file: SolveTaskFile, workDir: string, io: SolveIO): Promise<SolveOutcome>
}

/** A solve as stored: the field, or why it failed. */
export interface StoredSolve {
  path: string
  field: SolvedField | null
  source: SolveSource
  solvedAt: Date
  error: string | null
}

/** Driven port: the lights and masters in the index, and the solves stored for them. */
export interface SolveStore {
  /** Lights and masters linked to a target, or every target's when none is given. */
  files(targetId?: string): Promise<SkyFile[]>
  /** Every stored solve, or those of the given files. */
  solves(paths?: string[]): Promise<StoredSolve[]>
  save(solve: StoredSolve): Promise<void>
}

/** A target as the mosaic planner needs it. */
export interface MosaicTarget {
  id: string
  name: string
  raHours: number | null
  decDeg: number | null
  /** Catalogue size, in arc minutes. */
  sizeArcmin: number | null
  /** The sum of the target's integration goals, in seconds; null when none is set. */
  goalSec: number | null
}

/** A mosaic plan the user saved for a target. */
export interface SavedMosaic {
  targetId: string
  field: MosaicPlan['field']
  rotationDeg: number
  overlap: number
  savedAt: Date
}

/** Driven port: targets, their saved mosaic plans, and the part_of_mosaic links between targets. */
export interface MosaicStore {
  target(targetId: string): Promise<MosaicTarget | null>
  plan(targetId: string): Promise<SavedMosaic | null>
  plans(): Promise<SavedMosaic[]>
  savePlan(plan: SavedMosaic): Promise<void>
  /** Records each other target as part of the mosaic of `targetId`; links already there are kept. */
  linkPanels(targetId: string, panelTargetIds: string[]): Promise<void>
  /** Targets already linked to this one as part of a mosaic, either way round. */
  linked(targetId: string): Promise<string[]>
}
