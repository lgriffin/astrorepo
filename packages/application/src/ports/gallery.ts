import type { CatalogueObject, FilterIntegration, ImageInspection, ImagePreview, PaletteId, PreviewChannel } from '@astro/domain'

/** Header cards a world coordinate system is read from (CRVAL, CRPIX, CD, CDELT, CROTA, CTYPE, NAXIS). */
export type WcsHeader = Record<string, number | string>

/**
 * Driven port: an image's pixels. Reads the file, never writes it, and does the reading off the
 * main process, sending back only statistics and small previews (NFR-019). Throws with a reason
 * the user can act on when the file cannot be read.
 */
export interface ImagePixels {
  inspect(path: string): Promise<ImageInspection>
  /** A small auto-stretched preview, and the WCS cards of the file's header (none for a PNG). */
  preview(path: string, options: { maxWidth: number; channel?: PreviewChannel }): Promise<{ preview: ImagePreview; header: WcsHeader }>
}

/** An image of a target the gallery can show: a stacked master, or a finished image. */
export interface GalleryImage {
  path: string
  name: string
  kind: 'master' | 'finished'
  /** FILTER of a master; null for a finished image or a master taken without one. */
  filter: string | null
  /** Three channels; null when unknown. */
  colour: boolean | null
  modifiedAt: Date | null
}

/** Driven port: what the index knows about the images the inspector and gallery show. */
export interface GalleryCatalogue {
  /** An indexed FITS file by its id, or null when the index no longer holds it. */
  fileById(fileId: string): Promise<{ path: string; name: string } | null>
  /** A target's masters, newest first, then its finished images (FITS and PNG), newest first. Files gone from disk are left out. */
  targetImages(targetId: string): Promise<GalleryImage[]>
  /** A target's light integration per filter, and whether those lights came from a colour sensor. */
  filterIntegration(targetId: string): Promise<FilterIntegration[]>
  /** Messier, NGC and IC objects with coordinates. */
  catalogueObjects(): Promise<CatalogueObject[]>
}

/** Driven port: the palette chosen for each target. */
export interface PaletteStore {
  chosen(targetId: string): Promise<PaletteId | null>
  /** Saves the choice, or clears it with null. */
  choose(targetId: string, palette: PaletteId | null, at: Date): Promise<void>
}
