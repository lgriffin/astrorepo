import {
  describeObject,
  highestAltitudeDeg,
  midnightMonth,
  objectNameIndex,
  readImageName,
  referenceUrl,
  suitsNarrowband,
  type ImageNameReading,
  type ObjectNameIndex,
  type ReferenceSite
} from '@astro/domain'
import type { ObjectCatalogue, ObjectFacts, Picture, PictureFile, PictureFolder } from '../ports/picture-gallery'
import type { PlanningSettings } from '../ports/sky'

export interface PictureGalleryDeps {
  folder: PictureFolder
  catalogue: ObjectCatalogue
  planning: Pick<PlanningSettings, 'site'>
}

/** A request the gallery turns down, with a reason the user can act on (GAL-011). */
export class PictureRefusedError extends Error {}

/** An object a picture's name names, short enough for a thumbnail's caption. */
export interface NamedInPicture {
  objectId: string
  /** "M31 · Andromeda Galaxy", or just the designation or name when it has only one. */
  label: string
}

export interface GalleryEntry extends PictureFile {
  objects: NamedInPicture[]
}

export interface GalleryListing {
  /** The folder the gallery shows; null when no home folder is set or it has no images folder. */
  root: string | null
  /** Newest first, then by name. */
  pictures: GalleryEntry[]
}

/** One object of a picture, with what it is, what the user has of it and when it is best placed. */
export interface ObjectPanel {
  facts: ObjectFacts
  /** The designation or name in the picture's name that found it. */
  matched: string
  /** One sentence on what it is. */
  summary: string
  /** The month it is highest at midnight, 0 for January; null without coordinates. */
  bestMonth: number | null
  /** Its highest altitude from the user's site; null without a site or coordinates. */
  highestAltitudeDeg: number | null
  /** Emission nebulae and the like, which a dual-band or narrowband filter suits. */
  narrowband: boolean
}

export interface PictureDetails {
  picture: GalleryEntry
  /** Whether the objects were read from the file's name or from a folder it is in; null when neither names one. */
  readFrom: ImageNameReading['from']
  objects: ObjectPanel[]
  /** Designations in the name that the app's catalogues do not hold (GAL-010). */
  unknown: string[]
  /** Whether the user has set a site, so the panel can offer to set one (GAL-007). */
  hasSite: boolean
}

export type PictureRead = ({ ok: true } & Picture) | { ok: false; error: string }

const byNewest = (a: PictureFile, b: PictureFile) =>
  (b.modifiedAt?.getTime() ?? 0) - (a.modifiedAt?.getTime() ?? 0) || a.name.localeCompare(b.name) || a.path.localeCompare(b.path)

/**
 * The gallery of finished pictures (spec 031): every PNG and JPEG in the images folder, each
 * matched by its name to the catalogue objects it shows, with a side panel on each object.
 * The window names a picture by its path, and only paths the folder listed are ever read.
 */
export function makePictureGallery(deps: PictureGalleryDeps) {
  let index: Promise<ObjectNameIndex> | null = null
  const names = () => (index ??= deps.catalogue.namedObjects().then(objectNameIndex))
  /** The paths last listed, so reading a thumbnail does not walk the folder again. */
  let listed = new Map<string, PictureFile>()

  const label = (idx: ObjectNameIndex, objectId: string): string => {
    const o = idx.objects.get(objectId)
    const parts = [o?.designations[0], o?.names[0]].filter((p): p is string => !!p)
    return parts.join(' · ') || objectId
  }

  const entry = (idx: ObjectNameIndex, file: PictureFile): GalleryEntry => ({
    ...file,
    objects: readImageName(file.name, file.folders, idx).matches.map(m => ({ objectId: m.objectId, label: label(idx, m.objectId) }))
  })

  const list = async (): Promise<PictureFile[]> => {
    const files = await deps.folder.list()
    listed = new Map(files.map(f => [f.path, f]))
    return files
  }

  /** A listed picture; the folder is listed again once before a path it has not listed is refused. */
  const listedPicture = async (path: string): Promise<PictureFile> => {
    const known = listed.get(path) ?? (await list(), listed.get(path))
    if (!known) throw new PictureRefusedError('That picture is not in the images folder any more. Open the gallery again to see what is there.')
    return known
  }

  return {
    /** Every picture under the root with the objects its name names (GAL-001, GAL-003). */
    async browse(): Promise<GalleryListing> {
      // Each visit reads the catalogue afresh, so a target added since is matched.
      index = null
      // Without a root the folder lists nothing, so a path listed before is refused from now on.
      const [root, files, idx] = await Promise.all([deps.folder.root(), list(), names()])
      return { root, pictures: files.map(f => entry(idx, f)).sort(byNewest) }
    },

    /** The side panel of one picture (GAL-002, GAL-005 to GAL-010); refuses a path the folder did not list (GAL-011). */
    async details(path: string): Promise<PictureDetails> {
      const file = await listedPicture(path)
      const [idx, site] = await Promise.all([names(), deps.planning.site()])
      const reading = readImageName(file.name, file.folders, idx)
      const objects: ObjectPanel[] = []
      for (const m of reading.matches) {
        const facts = await deps.catalogue.objectFacts(m.objectId)
        if (!facts) continue
        objects.push({
          facts,
          matched: m.text,
          summary: describeObject(facts),
          bestMonth: facts.raHours === null ? null : midnightMonth(facts.raHours),
          highestAltitudeDeg: site && facts.decDeg !== null ? highestAltitudeDeg(site.latitudeDeg, facts.decDeg) : null,
          narrowband: facts.objectType !== null && suitsNarrowband(facts.objectType)
        })
      }
      return { picture: entry(idx, file), readFrom: reading.from, objects, unknown: reading.unknown, hasSite: site !== null }
    },

    /** A listed picture's bytes at most `maxWidth` wide (NFR-021), or why it cannot be read (GAL-013); refuses any other path (GAL-011). */
    async picture(path: string, maxWidth: number): Promise<PictureRead> {
      await listedPicture(path)
      try {
        return { ok: true, ...(await deps.folder.read(path, maxWidth)) }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    },

    /** The SIMBAD or Wikipedia page about a catalogue object (GAL-008); null when the catalogue no longer holds it. */
    async reference(objectId: string, site: ReferenceSite): Promise<string | null> {
      const facts = await deps.catalogue.objectFacts(objectId)
      if (!facts) return null
      // A name that is itself a designation ("NGC 9") is no common name; referenceUrl skips it.
      return referenceUrl(site, facts.designations[0] ?? facts.name, facts.name)
    }
  }
}

export type PictureGallery = ReturnType<typeof makePictureGallery>
