/** What the learning cards need to know about a target (specs/042-learning). */
export interface TargetFacts {
  /** Every name the target goes by: its own, its catalogue designations, its aliases. */
  names: string[]
  /** Its size on the sky in arcminutes, when the catalogue gives one. */
  angularSizeArcmin: number | null
}

/** Driven port: a target's names and size, or null for a target that does not exist. */
export interface TargetFactsSource {
  facts(targetId: string): Promise<TargetFacts | null>
}
