import type { PictureCandidate } from '@astro/domain'

/** A Messier object as the seeded catalogue files it, with the target that holds its frames and images. */
export interface MessierObject {
  /** 1 to 110. */
  number: number
  /** As the catalogue writes it, such as "M31". */
  designation: string
  targetId: string
  /** The common name, or null when the catalogue has none beyond the designation. */
  name: string | null
  objectType: string
  constellation: string | null
  magnitude: number | null
  /** J2000; null when the catalogue has no position. */
  raHours: number | null
  decDeg: number | null
}

/** Driven port: the Messier catalogue and the images each object's target has (specs/032-messier-mosaic). */
export interface MessierCatalogue {
  /** The Messier objects the catalogue holds, by number, each once. */
  objects(): Promise<MessierObject[]>
  /**
   * A target's images a tile could show: the JPEG, PNG, TIFF and FITS files in its images folder
   * and the folders directly inside it, and its stacked masters. Files gone from disk are left out.
   */
  pictures(targetId: string): Promise<PictureCandidate[]>
}

/** A small picture of an image, encoded for the window to show as it is. */
export interface TilePicture {
  mime: 'image/png' | 'image/jpeg'
  data: Uint8Array
  width: number
  height: number
}

/** Driven port: draws an image file as a small picture for a tile. */
export interface TilePictures {
  /**
   * The image at most `maxWidth` pixels wide, its shape kept: as the file has it when `stretch` is
   * false (a finished image), auto-stretched when true (a linear master). Reads the file, never
   * writes it. Throws with a reason the user can act on when it cannot be drawn.
   */
  draw(path: string, options: { maxWidth: number; stretch: boolean }): Promise<TilePicture>
}
