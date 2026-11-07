/** The gallery of finished pictures (spec 031). */

// ── Gallery (spec 031) ─────────────────────────────────────────────────────

/** A picture in the gallery's grid. */
export interface GalleryPictureView {
  path: string
  name: string
  /** The folders between the images folder and the picture, joined with " / "; empty in the images folder itself. */
  folder: string
  /** The folder the picture is in, for Open folder. */
  folderPath: string
  /** "2.4 MB". */
  size: string
  /** ISO time it was saved; null when unknown. */
  savedAt: string | null
  /** "1 Oct 2026". */
  saved: string | null
  /** The objects its name names, as captions: "M31 · Andromeda Galaxy", with their designations. */
  objects: { id: string; label: string; designations: string[] }[]
}

export interface GalleryView {
  /** The images folder shown; null when no home folder is set or it has no images folder. */
  root: string | null
  pictures: GalleryPictureView[]
}

/** One catalogue object in a picture's side panel. */
export interface GalleryObjectView {
  id: string
  name: string
  /** "M31, NGC 224". */
  designations: string
  /** What in the picture's name found it. */
  matched: string
  /** "A galaxy in Andromeda, magnitude 3.4, 3°, about 6 full moons across." */
  summary: string
  description: string | null
  facts: { label: string; value: string }[]
  /** "Highest at midnight in late September." Null without coordinates. */
  bestPlaced: string | null
  /** "Climbs to 78° from your site." or "Never rises from your site."; null without a site or coordinates. */
  fromSite: string | null
  /** True when the user has not set a site, so the panel can link to it. */
  needsSite: boolean
  /** "Emission nebula: a dual-band or narrowband filter suits it." or null. */
  filterHint: string | null
  /** What the user has of it, as label and value rows. */
  data: { label: string; value: string }[]
  /** True when the user has no frames of it. */
  noData: boolean
  hasMosaicPlan: boolean
  collections: { id: string; name: string }[]
}

export interface GalleryDetailsView {
  picture: GalleryPictureView
  /** "Read from the file name." / "Read from the folder M42." / null */
  readFrom: string | null
  objects: GalleryObjectView[]
  /** Designations in the name the catalogues do not hold. */
  unknown: string[]
}

/** A picture to draw, or why it cannot be. */
export type GalleryPictureData = { ok: true; src: string; width: number | null; height: number | null } | { ok: false; error: string }
