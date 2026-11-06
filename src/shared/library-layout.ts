/**
 * The library layout in Settings → Folders and on Library (specs/044-library-layout). The renderer
 * may not import the domain (HEX-002), so the parts and their names are repeated here; a test keeps
 * them equal.
 */

export const LIBRARY_PARTS = ['raw', 'stacked', 'tif', 'images'] as const
export type LibraryPart = (typeof LIBRARY_PARTS)[number]

export const LIBRARY_PART_LABELS: Record<LibraryPart, string> = {
  raw: 'Raw frames',
  stacked: 'Stacked masters',
  tif: 'TIFF exports',
  images: 'Finished pictures'
}

/** The same names inside a sentence. */
export const LIBRARY_PART_NAMES: Record<LibraryPart, string> = {
  raw: 'raw frames',
  stacked: 'stacked masters',
  tif: 'TIFF exports',
  images: 'finished pictures'
}

/** What each part feeds, for the line under it. */
export const LIBRARY_PART_HINTS: Record<LibraryPart, string> = {
  raw: 'Lights and camera RAW, read for their headers: frame counts, nights and stacking suggestions',
  stacked: 'Masters, read for their headers: a target with one is stacked',
  tif: 'Exports: a target with one is being processed',
  images: 'Finished PNG and JPEG pictures: thumbnails, the Gallery and the Messier mosaic'
}

export interface LibraryPartView {
  part: LibraryPart
  label: string
  hint: string
  /** The folder read now. */
  path: string
  /** Chosen in Settings, found by its conventional name, or not there yet. */
  source: 'chosen' | 'named' | 'missing'
  /** The folder that looks like this part, and why; null when none does. */
  suggestion: { path: string; name: string; basis: 'name' | 'contents'; reasons: string[] } | null
  /** Whether taking the suggestion would change the folder read now. */
  change: boolean
}

export type LibraryLayoutView =
  | { status: 'no-home' }
  | {
      status: 'ok'
      home: string
      parts: LibraryPartView[]
      /** How many parts the suggestion would change. */
      changes: number
      /** Folders under the home folder given no part. */
      unused: string[]
      /** The home folder holds folders named for objects: filed by target first, which the scan does not read yet. */
      byTarget: boolean
      /** One sentence on the layout, for the top of the card. */
      summary: string
    }

export type ChooseLayoutResult = { saved: true } | { saved: false; problems: string[] }

/** The layout the suggestion makes: each part it changes, at its suggested folder. */
export function suggestedLayout(view: Extract<LibraryLayoutView, { status: 'ok' }>): Partial<Record<LibraryPart, string>> {
  return Object.fromEntries(view.parts.filter(p => p.change && p.suggestion).map(p => [p.part, p.suggestion!.path]))
}
