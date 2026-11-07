/** The gallery inspector (spec 025). */

// ── Gallery inspector (spec 025) ──────────────────────────────────────────

export interface ChannelStatsView {
  channel: 'L' | 'R' | 'G' | 'B'
  /** "Luminance", "Red", "Green", "Blue". */
  label: string
  median: string
  noise: string
  saturated: string
  black: string
  histogram: { min: string; max: string; counts: number[] }
}

/** What the inspector shows for one file on the FITS files page. */
export interface InspectionView {
  /** Set when the file could not be read, saying why and what to do. */
  error: string | null
  /** "A colour sensor's raw frame, 4144 × 2822. Figures from 1,000,000 pixels per channel." */
  summary: string | null
  channels: ChannelStatsView[]
  star: { fwhm: string; peak: string; position: string; profile: number[] } | null
  /** Why there is no star profile, when there is none. */
  starNote: string | null
  /** Clipping worth knowing about, in plain sentences. */
  warnings: string[]
}

/** A coordinate grid and catalogue labels, in the preview's pixels. */
export interface OverlayView {
  lines: { kind: 'ra' | 'dec'; label: string; points: [number, number][] }[]
  objects: { label: string; x: number; y: number; radius: number | null }[]
}

/** A small auto-stretched preview, its pixels base64-encoded row by row from the top. */
export interface PreviewView {
  error: string | null
  width: number
  height: number
  channels: 1 | 3
  pixelsBase64: string
  /** The image's own size, which the preview is a reduction of. */
  sourceSize: string | null
  /** Null when the image's header carries no world coordinate system. */
  overlay: OverlayView | null
  /** "Centred on 5h 35m, −5° 23′ at 1.24″ per pixel, north turned 12°." */
  fieldText: string | null
}

/** A file opened in the inspector: its figures, and its preview when it could be read. */
export interface OpenedFileView {
  inspection: InspectionView
  preview: PreviewView | null
}

export interface GalleryImageView {
  path: string
  /** "master_Ha.fit (Ha master, 2026-02-01)". */
  label: string
  kind: 'master' | 'finished'
}

export interface PaletteOptionView {
  id: string
  possible: boolean
  /** "SII as red, Ha as green, OIII as blue." */
  mapping: string
  /** What stands in the way of the palette or its preview; null when it can be previewed. */
  note: string | null
  canPreview: boolean
}

export interface PalettesView {
  options: PaletteOptionView[]
  chosen: string | null
  /** Set when the target has no filters a palette can use yet. */
  message: string | null
}

export interface PalettePreviewView {
  error: string | null
  red: string
  green: string
  blue: string
  luminance: string | null
  /** Each channel as a grey preview, by channel name. */
  channels: Record<string, { width: number; height: number; pixelsBase64: string }>
}

/** The Vespera's connection settings as the control page shows them (spec 033). */
export interface VesperaSettingsView {
  /** "10.0.0.1", with ":port" when it is not 21. */
  address: string
  /** Where copies land; null when neither it nor the home folder is set. */
  landingRoot: string | null
  /** The landing folder comes from the home folder, not a setting of its own. */
  landingIsDefault: boolean
  formats: Array<'fits' | 'tiff' | 'jpeg' | 'json'>
  /** Saved settings that could not be read, and what is used instead. */
  notes: string[]
}
