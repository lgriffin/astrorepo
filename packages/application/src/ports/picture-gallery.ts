import type { NamedObject } from '@astro/domain'

/** A finished picture under the gallery's root, as the folder lists it. */
export interface PictureFile {
  path: string
  name: string
  /** The folders between the root and the file, outermost first; empty for a file in the root itself. */
  folders: string[]
  sizeBytes: number
  modifiedAt: Date | null
}

/** A picture's bytes, ready for the window to draw, and its own size when known. */
export interface Picture {
  /** Base64 of the encoded image. */
  data: string
  mime: string
  /** The picture's own width and height in pixels; null when the reader did not decode it. */
  width: number | null
  height: number | null
}

/**
 * Driven port: the finished pictures in the images folder of the home folder (spec 031). Lists and
 * reads; never writes, renames or moves a file (NFR-021).
 */
export interface PictureFolder {
  /** The images folder of the home folder, or null when no home folder is set or it has none. */
  root(): Promise<string | null>
  /** Every PNG and JPEG under the root and its folders, hidden and linked folders left out. Empty without a root. */
  list(): Promise<PictureFile[]>
  /**
   * A picture shrunk to at most `maxWidth` pixels wide when the reader can shrink it, else its own
   * bytes. Throws with a reason the user can act on when it cannot be read.
   */
  read(path: string, maxWidth: number): Promise<Picture>
}

/** What the catalogue and the index know about one object, for the gallery's side panel. */
export interface ObjectFacts {
  id: string
  /** The name it is shown by: its common name, else its first designation. */
  name: string
  objectType: string | null
  constellation: string | null
  magnitude: number | null
  sizeArcmin: number | null
  raHours: number | null
  decDeg: number | null
  description: string | null
  /** Its catalogue designations in catalogue order (Messier, NGC, IC, Caldwell, Sharpless, then others). */
  designations: string[]
  /** Other names it is known by, designations left out. */
  aliases: string[]
  /** Collections it belongs to. */
  collections: { id: string; name: string }[]
  /** Its workflow stage ("not_observed", "raw_captured", ...). */
  stage: string
  /** What the user has of it. */
  data: {
    lightFrames: number
    integrationSec: number
    /** Nights with light frames, a night running from noon to noon UTC. */
    nights: number
    /** The last of those nights (YYYY-MM-DD); null without frames. */
    lastNight: string | null
    masters: number
    hasMosaicPlan: boolean
  }
}

/** Driven port: the catalogue objects a picture's name is matched against, and what is known of each. */
export interface ObjectCatalogue {
  /** Every object of the catalogue with its designations and names. */
  namedObjects(): Promise<NamedObject[]>
  /** What is known of an object, or null when the catalogue no longer holds it. */
  objectFacts(objectId: string): Promise<ObjectFacts | null>
}
