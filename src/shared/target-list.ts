/** Which targets the Targets page lists (specs/041-look-and-feel V4, LF-020). */
export type TargetScope = 'mine' | 'all'

export const TARGET_SCOPES: readonly { id: TargetScope; label: string }[] = [
  { id: 'mine', label: 'Yours' },
  { id: 'all', label: 'Whole catalogue' }
]

export const OBJECT_TYPE_FILTERS = [
  { value: '', label: 'All types' },
  { value: 'galaxy', label: 'Galaxies' },
  { value: 'emission_nebula', label: 'Emission nebulae' },
  { value: 'reflection_nebula', label: 'Reflection nebulae' },
  { value: 'planetary_nebula', label: 'Planetary nebulae' },
  { value: 'dark_nebula', label: 'Dark nebulae' },
  { value: 'open_cluster', label: 'Open clusters' },
  { value: 'globular_cluster', label: 'Globular clusters' },
  { value: 'supernova_remnant', label: 'Supernova remnants' },
  { value: 'galaxy_cluster', label: 'Galaxy clusters' },
  { value: 'star', label: 'Stars' },
  { value: 'custom', label: 'Added by hand' }
] as const

export const TARGET_SORTS = [
  { value: 'name:asc', label: 'Name, A to Z' },
  { value: 'name:desc', label: 'Name, Z to A' },
  { value: 'magnitude:asc', label: 'Brightest first' },
  { value: 'magnitude:desc', label: 'Faintest first' },
  { value: 'constellation:asc', label: 'Constellation' },
  { value: 'workflow_stage:asc', label: 'Stage' }
] as const

/** A stage's name as a sentence: not_observed reads "Not observed". */
export function stageWords(stage: string): string {
  const words = stage.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** The line under the page title: "12 of your targets", "3 of your targets match", "13,970 in the catalogue". */
export function targetCountLine(total: number, scope: TargetScope, filtered: boolean): string {
  const n = total.toLocaleString('en-GB')
  if (scope === 'mine') {
    if (filtered) return `${n} of your targets ${total === 1 ? 'matches' : 'match'}`
    return total === 1 ? '1 target of yours' : `${n} targets of yours`
  }
  if (filtered) return `${n} in the catalogue ${total === 1 ? 'matches' : 'match'}`
  return `${n} in the catalogue`
}
