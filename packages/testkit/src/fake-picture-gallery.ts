import type { ObjectCatalogue, ObjectFacts, Picture, PictureFile, PictureFolder } from '@astro/application'
import type { NamedObject } from '@astro/domain'

/**
 * Pictures from a script: a root folder and the files in it by path relative to the root. Reads
 * answer with the file's own bytes and say how wide they were asked to be, and every read is kept.
 */
export class InMemoryPictureFolder implements PictureFolder {
  rootPath: string | null = '/home/images'
  readonly files = new Map<string, { sizeBytes: number; modifiedAt: Date | null; bytes: string }>()
  readonly failures = new Map<string, string>()
  readonly reads: { path: string; maxWidth: number }[] = []
  listings = 0

  /** Adds a picture at a path under the root ("M31.png", "M42/final.png"). */
  add(relative: string, options: { modifiedAt?: string | null; sizeBytes?: number; bytes?: string } = {}): this {
    this.files.set(relative, {
      sizeBytes: options.sizeBytes ?? 1000,
      modifiedAt: options.modifiedAt === null ? null : new Date(options.modifiedAt ?? '2026-10-01T12:00:00Z'),
      bytes: options.bytes ?? relative
    })
    return this
  }

  /** The full path of a picture added at `relative`. */
  pathOf(relative: string): string {
    return `${this.rootPath}/${relative}`
  }

  async root(): Promise<string | null> {
    return this.rootPath
  }

  async list(): Promise<PictureFile[]> {
    this.listings++
    if (!this.rootPath) return []
    return [...this.files.entries()]
      .filter(([rel]) => /\.(png|jpe?g)$/i.test(rel) && !rel.split('/').some(p => p.startsWith('.')))
      .map(([rel, f]) => {
        const parts = rel.split('/')
        return { path: this.pathOf(rel), name: parts[parts.length - 1], folders: parts.slice(0, -1), sizeBytes: f.sizeBytes, modifiedAt: f.modifiedAt }
      })
  }

  async read(path: string, maxWidth: number): Promise<Picture> {
    this.reads.push({ path, maxWidth })
    const failure = this.failures.get(path)
    if (failure) throw new Error(failure)
    const rel = this.rootPath && path.startsWith(`${this.rootPath}/`) ? path.slice(this.rootPath.length + 1) : null
    const file = rel === null ? undefined : this.files.get(rel)
    if (!file) throw new Error(`${path} is no longer there.`)
    return { data: Buffer.from(file.bytes).toString('base64'), mime: /\.png$/i.test(path) ? 'image/png' : 'image/jpeg', width: null, height: null }
  }
}

/** An object's facts with nothing known but its name, for tests that set only what they need. */
export function objectFacts(id: string, overrides: Partial<ObjectFacts> = {}): ObjectFacts {
  return {
    id,
    name: id,
    objectType: null,
    constellation: null,
    magnitude: null,
    sizeArcmin: null,
    raHours: null,
    decDeg: null,
    description: null,
    designations: [],
    aliases: [],
    collections: [],
    stage: 'not_observed',
    data: { lightFrames: 0, integrationSec: 0, nights: 0, lastNight: null, masters: 0, hasMosaicPlan: false },
    ...overrides
  }
}

/** A catalogue from a script: each object's facts, its designations and names taken from them. */
export class InMemoryObjectCatalogue implements ObjectCatalogue {
  readonly objects = new Map<string, ObjectFacts>()
  /** How many times the names were read, so a test can see the gallery read them afresh. */
  namesRead = 0

  add(facts: ObjectFacts): this {
    this.objects.set(facts.id, facts)
    return this
  }

  async namedObjects(): Promise<NamedObject[]> {
    this.namesRead++
    return [...this.objects.values()].map(o => ({
      id: o.id,
      designations: [...o.designations],
      names: [...(o.designations.includes(o.name) ? [] : [o.name]), ...o.aliases]
    }))
  }

  async objectFacts(objectId: string): Promise<ObjectFacts | null> {
    const o = this.objects.get(objectId)
    return o ? structuredClone(o) : null
  }
}
