import type { ObjectType } from './types'
import type { Token } from './themes'

/**
 * How a deep-sky atlas marks each kind of object (specs/041-look-and-feel, LF-009), after the
 * conventions of Sky Atlas 2000 and Uranometria: the symbol, the colour printed atlases give the
 * kind, and its name as the app says it.
 */
export type AtlasSymbolKind =
  | 'galaxy' // an ellipse
  | 'open-cluster' // a dotted circle
  | 'globular-cluster' // a circle with a cross
  | 'planetary-nebula' // a disc with four rays
  | 'bright-nebula' // a square
  | 'dark-nebula' // a dashed square
  | 'remnant' // a square with a circle inside
  | 'galaxy-cluster' // three small ellipses
  | 'star' // a filled dot
  | 'solar-system' // a circle with a dot
  | 'field' // a dashed circle, for wide fields and anything else

export interface AtlasMark {
  symbol: AtlasSymbolKind
  tone: Token
  label: string
}

export const ATLAS_MARKS: Record<ObjectType, AtlasMark> = {
  galaxy: { symbol: 'galaxy', tone: 'cat-1', label: 'Galaxy' },
  emission_nebula: { symbol: 'bright-nebula', tone: 'cat-5', label: 'Emission nebula' },
  reflection_nebula: { symbol: 'bright-nebula', tone: 'cat-2', label: 'Reflection nebula' },
  planetary_nebula: { symbol: 'planetary-nebula', tone: 'cat-3', label: 'Planetary nebula' },
  dark_nebula: { symbol: 'dark-nebula', tone: 'cat-8', label: 'Dark nebula' },
  open_cluster: { symbol: 'open-cluster', tone: 'cat-4', label: 'Open cluster' },
  globular_cluster: { symbol: 'globular-cluster', tone: 'cat-4', label: 'Globular cluster' },
  star_cluster: { symbol: 'open-cluster', tone: 'cat-4', label: 'Star cluster' },
  supernova_remnant: { symbol: 'remnant', tone: 'cat-5', label: 'Supernova remnant' },
  molecular_cloud: { symbol: 'dark-nebula', tone: 'cat-8', label: 'Molecular cloud' },
  galaxy_cluster: { symbol: 'galaxy-cluster', tone: 'cat-1', label: 'Galaxy cluster' },
  star: { symbol: 'star', tone: 'cat-7', label: 'Star' },
  variable_star: { symbol: 'star', tone: 'cat-7', label: 'Variable star' },
  comet: { symbol: 'solar-system', tone: 'cat-6', label: 'Comet' },
  asteroid: { symbol: 'solar-system', tone: 'cat-6', label: 'Asteroid' },
  planet: { symbol: 'solar-system', tone: 'cat-6', label: 'Planet' },
  moon: { symbol: 'solar-system', tone: 'cat-6', label: 'Moon' },
  solar_object: { symbol: 'solar-system', tone: 'cat-6', label: 'Solar system object' },
  widefield_region: { symbol: 'field', tone: 'cat-8', label: 'Wide field' },
  constellation: { symbol: 'field', tone: 'cat-8', label: 'Constellation' },
  custom: { symbol: 'field', tone: 'cat-8', label: 'Custom' },
  unknown: { symbol: 'field', tone: 'cat-8', label: 'Unknown' }
}

/** The mark for a stored type; a type the app does not know is drawn as unknown. */
export function atlasMark(objectType: string): AtlasMark {
  return (ATLAS_MARKS as Record<string, AtlasMark>)[objectType] ?? ATLAS_MARKS.unknown
}
