/**
 * Ingest from a Vespera Pro over FTP (specs/034-vespera-ingest). The scope keeps one folder per
 * session under user/, named by when it started and what kind of session it was, with one
 * sub-folder per pointing or capture run. These rules read that layout from directory listings
 * alone, count what each session holds, say what looks wrong with the counts, name the folder a
 * copy goes into, and order and record the copy. The scope is only ever read. Pure rules.
 */

// ── What the scope lists ───────────────────────────────────────────────

/** One entry of a directory listing on the scope. */
export interface ScopeEntry {
  name: string
  type: 'dir' | 'file'
  sizeBytes: number
  /** From MLSD when the server gives it; null otherwise. */
  modifiedAt: Date | null
}

export type VesperaFileKind = 'fits' | 'tiff' | 'jpeg' | 'json' | 'other'

/**
 * What a file is for: a raw `frame` (img-NNNN.fits), the stack's `output` (img-NNNN-output.jpg and
 * .json), a frame's `stacking` decision, the run's `capture` settings or the session's
 * `observation` metadata. Absent for the TIFF stack and anything unrecognised.
 */
export type VesperaFileRole = 'frame' | 'output' | 'stacking' | 'capture' | 'observation'

export interface VesperaFile {
  name: string
  kind: VesperaFileKind
  role?: VesperaFileRole
  sizeBytes: number
  /** The NNNN of img-NNNN: the count of shots taken when it was written. */
  frameNo?: number
  modifiedAt: Date | null
}

export type VesperaRunStage = 'pointing' | 'images' | 'unknown'

/** The run steps the firmware is known to write; any other step is still inventoried. */
export const KNOWN_RUN_STEPS: readonly string[] = ['initial', 'adjust-framing', 'adjust-focus']

export interface VesperaRun {
  /** The sub-folder's name, kept verbatim: the copy mirrors it. */
  folder: string
  /** The NN- prefix: a running counter across pointing and image runs. Orders runs, never classifies them. */
  order: number | null
  stage: VesperaRunStage
  /** initial, adjust-framing, adjust-focus, or whatever a newer firmware calls it; '' when unknown. */
  step: string
  files: VesperaFile[]
}

/** The session kinds the firmware is known to write. Any other lowercase kind still parses. */
export const KNOWN_SESSION_KINDS: readonly string[] = ['observation', 'auto-init', 'sun-mode']

export interface VesperaSession {
  /** The folder's name under user/: the only key the scope guarantees. */
  id: string
  /** observation, auto-init, sun-mode, another lowercase word, or 'unknown' when the name does not parse. */
  kind: string
  /** Scope-local time from the folder's name, as YYYY-MM-DDTHH:MM:SS; from the earliest file when the name has none. */
  startedAt: string | null
  /** Whether startedAt came from the folder's name. */
  timestamped: boolean
  /** Everything after `<kind>_`, verbatim: it may hold underscores and spaces. */
  rawLabel: string | null
  /** observation.json at the session's top, when there is one. */
  observationJson: string | null
  /** Files at the session's top (observation.json among them). */
  rootFiles: VesperaFile[]
  runs: VesperaRun[]
  /** When the listing of this session finished. */
  listedAt: Date
}

// ── Grammar ────────────────────────────────────────────────────────────

/**
 * A session folder: 2024-06-15_21-00-54_observation_NGC3372, 2024-06-15_21-52-17_auto-init.
 * The label is everything after the kind, underscores and spaces included.
 */
export const SESSION_FOLDER = /^(?<date>\d{4}-\d{2}-\d{2})_(?<time>\d{2}-\d{2}-\d{2})_(?<kind>observation|auto-init|sun-mode|[a-z][a-z-]*)(?:_(?<label>.+))?$/

/** A run sub-folder: 01-pointing-initial, 04-images-adjust-framing. */
export const RUN_FOLDER = /^(?:(?<order>\d{2})-)?(?<stage>pointing|images)-(?<step>[a-z][a-z-]*)$/

/** A file of an image run: img-0001.fits, img-0001-output.jpg, img-0001-output.json, img-0001-stacking.json. */
export const IMAGE_FILE = /^img-(?<frame>\d{4})(?:-(?<role>output|stacking))?\.(?<ext>fits|tiff?|jpe?g|json)$/i

/** The named sidecars: observation.json at a session's top, capture.json in each run. */
export const SIDECAR_FILE = /^(?<name>observation|capture)\.json$/i

/** The top-level folder of the scope that holds sessions; matched without regard to case. */
export const USER_FOLDER = 'user'
/** Calibration darks saved in expert mode: listed, never a session. */
export const EXPERT_MODE_FOLDER = 'expert-mode'

const isDate = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

export interface ParsedSessionFolder {
  kind: string
  startedAt: string
  rawLabel: string | null
}

/** Reads a session folder's name; null when it is not a timestamped session (an old or hand-made folder). */
export function parseSessionFolder(name: string): ParsedSessionFolder | null {
  const m = SESSION_FOLDER.exec(name)
  if (!m?.groups) return null
  const [y, mo, d] = m.groups.date.split('-').map(Number)
  const [h, mi, s] = m.groups.time.split('-').map(Number)
  if (!isDate(y, mo, d) || h > 23 || mi > 59 || s > 59) return null
  return { kind: m.groups.kind, startedAt: `${m.groups.date}T${m.groups.time.replace(/-/g, ':')}`, rawLabel: m.groups.label ?? null }
}

/** Reads a run sub-folder's name. A folder that is not a pointing or image run is stage 'unknown'. */
export function parseRunFolder(name: string): Pick<VesperaRun, 'order' | 'stage' | 'step'> {
  const m = RUN_FOLDER.exec(name)
  if (!m?.groups) {
    const order = /^(\d{2})-/.exec(name)
    return { order: order ? Number(order[1]) : null, stage: 'unknown', step: '' }
  }
  return { order: m.groups.order === undefined ? null : Number(m.groups.order), stage: m.groups.stage as VesperaRunStage, step: m.groups.step }
}

const EXT_KIND: Record<string, VesperaFileKind> = { fits: 'fits', fit: 'fits', tif: 'tiff', tiff: 'tiff', jpg: 'jpeg', jpeg: 'jpeg', json: 'json' }

/** Classifies a listed file by its name: case does not matter, .jpg and .jpeg are both JPEG, .tif and .tiff both TIFF. */
export function classifyFile(entry: Pick<ScopeEntry, 'name' | 'sizeBytes' | 'modifiedAt'>): VesperaFile {
  const base = { name: entry.name, sizeBytes: entry.sizeBytes, modifiedAt: entry.modifiedAt }
  const image = IMAGE_FILE.exec(entry.name)
  if (image?.groups) {
    const kind = EXT_KIND[image.groups.ext.toLowerCase()]
    const frameNo = Number(image.groups.frame)
    const role = image.groups.role?.toLowerCase() as 'output' | 'stacking' | undefined
    if (role) return { ...base, kind, role, frameNo }
    return kind === 'fits' ? { ...base, kind, role: 'frame', frameNo } : { ...base, kind, frameNo }
  }
  const sidecar = SIDECAR_FILE.exec(entry.name)
  if (sidecar?.groups) return { ...base, kind: 'json', role: sidecar.groups.name.toLowerCase() as 'observation' | 'capture' }
  const ext = /\.([A-Za-z]+)$/.exec(entry.name)?.[1].toLowerCase()
  return { ...base, kind: (ext && EXT_KIND[ext]) || 'other' }
}

/** The sessions folder's name as the scope spells it (user or USER); null when there is none. system/ is never looked into. */
export function findUserFolder(entries: ScopeEntry[]): string | null {
  return entries.find(e => e.type === 'dir' && e.name.toLowerCase() === USER_FOLDER)?.name ?? null
}

/** The entries of user/ that are sessions: every folder except expert-mode. */
export function sessionFolders(entries: ScopeEntry[]): string[] {
  return entries.filter(e => e.type === 'dir' && e.name.toLowerCase() !== EXPERT_MODE_FOLDER).map(e => e.name)
}

export interface ListedRun {
  folder: string
  entries: ScopeEntry[]
}

const toLocalIso = (d: Date) => d.toISOString().slice(0, 19)

/**
 * Builds a session from its listings: the entries at its top and each sub-folder's entries. Runs
 * are ordered by their NN- prefix, then by name. A folder whose name has no timestamp is still a
 * session, of kind 'unknown', starting at its earliest file's modified time when the listing gave one.
 * Folders below a run are not walked; they are not part of what the firmware writes.
 */
export function buildSession(id: string, top: ScopeEntry[], runs: ListedRun[], listedAt: Date): VesperaSession {
  const parsed = parseSessionFolder(id)
  const rootFiles = top.filter(e => e.type === 'file').map(classifyFile)
  const built: VesperaRun[] = runs
    .map(r => ({ folder: r.folder, ...parseRunFolder(r.folder), files: r.entries.filter(e => e.type === 'file').map(classifyFile) }))
    .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || (a.folder < b.folder ? -1 : a.folder > b.folder ? 1 : 0))
  let startedAt = parsed?.startedAt ?? null
  if (!parsed) {
    const times = [...rootFiles, ...built.flatMap(r => r.files)].flatMap(f => (f.modifiedAt && !Number.isNaN(f.modifiedAt.getTime()) ? [f.modifiedAt.getTime()] : []))
    startedAt = times.length > 0 ? toLocalIso(new Date(Math.min(...times))) : null
  }
  return {
    id,
    kind: parsed?.kind ?? 'unknown',
    startedAt,
    timestamped: parsed !== null,
    rawLabel: parsed?.rawLabel ?? null,
    observationJson: rootFiles.find(f => f.role === 'observation')?.name ?? null,
    rootFiles,
    runs: built,
    listedAt
  }
}

/** Newest first, by start time; sessions with no start time last, then by id. */
export function sortSessions(sessions: VesperaSession[]): VesperaSession[] {
  return [...sessions].sort((a, b) => {
    if (a.startedAt !== b.startedAt) {
      if (a.startedAt === null) return 1
      if (b.startedAt === null) return -1
      return a.startedAt < b.startedAt ? 1 : -1
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

// ── Counts and findings ────────────────────────────────────────────────

export type FindingLevel = 'info' | 'warn' | 'error'

export type FindingCode =
  | 'NO_IMAGES_RUN' | 'EMPTY_RUN' | 'NO_TIFF' | 'MANY_TIFF' | 'NO_FITS' | 'FITS_LT_JPEG' | 'FITS_GT_JPEG'
  | 'GAP_IN_FRAMES' | 'JSON_MISMATCH' | 'UNKNOWN_FILES' | 'UNKNOWN_RUN' | 'NO_TIMESTAMP' | 'SESSION_GREW'
  | 'TARGET_MISMATCH' | 'NAME_COUNT_STALE' | 'SIZE_MISMATCH' | 'DEST_EXISTS' | 'DISCONNECTED' | 'SPACE_SHORT' | 'UNSAFE_NAME'

export interface Finding {
  level: FindingLevel
  code: FindingCode
  message: string
  /** The run it is about, when it is about one. */
  run?: string
}

export type KindCounts = Record<VesperaFileKind, number>

export const FILE_KINDS: readonly VesperaFileKind[] = ['fits', 'tiff', 'jpeg', 'json', 'other']

const zero = (): KindCounts => ({ fits: 0, tiff: 0, jpeg: 0, json: 0, other: 0 })

export interface VesperaInventory {
  sessionId: string
  perRun: Record<string, KindCounts>
  /** Every file of the session, its top-level files included. */
  totals: KindCounts
  bytes: number
  findings: Finding[]
}

const count = (files: VesperaFile[]) => {
  const c = zero()
  for (const f of files) c[f.kind]++
  return c
}

/** Frame numbers between the lowest and highest that are missing, in order. */
export function frameGaps(frames: number[]): number[] {
  if (frames.length === 0) return []
  const have = new Set(frames)
  const lo = Math.min(...frames)
  const hi = Math.max(...frames)
  const gaps: number[] = []
  for (let n = lo + 1; n < hi; n++) if (!have.has(n)) gaps.push(n)
  return gaps
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/**
 * Counts a session's files per run and in total, and says what looks wrong. Reads nothing; never
 * compares a count with the stacked-frame count the scope writes in a JPEG's EXIF, which this
 * firmware reports one short. The JPEG sequence has holes whenever a frame was rejected from the
 * stack, so only the raw FITS frames are checked for gaps.
 */
export function inventorySession(session: VesperaSession): VesperaInventory {
  const findings: Finding[] = []
  const perRun: Record<string, KindCounts> = {}
  const totals = count(session.rootFiles)
  let bytes = session.rootFiles.reduce((s, f) => s + f.sizeBytes, 0)

  if (!session.timestamped) {
    findings.push({ level: 'info', code: 'NO_TIMESTAMP', message: `"${session.id}" has no date in its name, so its start is taken from its earliest file.` })
  }
  const imageRuns = session.runs.filter(r => r.stage === 'images')
  if (imageRuns.length === 0) {
    findings.push({ level: 'error', code: 'NO_IMAGES_RUN', message: 'The session has no image run, so there is nothing to keep.' })
  }

  for (const run of session.runs) {
    const c = count(run.files)
    perRun[run.folder] = c
    for (const k of FILE_KINDS) totals[k] += c[k]
    bytes += run.files.reduce((s, f) => s + f.sizeBytes, 0)

    if (run.stage === 'unknown' || !KNOWN_RUN_STEPS.includes(run.step)) {
      findings.push({ level: 'info', code: 'UNKNOWN_RUN', run: run.folder, message: `${run.folder} is not a run this firmware is known to write; its files are counted anyway.` })
    }
    if (c.other > 0) {
      findings.push({ level: 'info', code: 'UNKNOWN_FILES', run: run.folder, message: `${run.folder} holds ${plural(c.other, 'file')} of a kind astrorepo does not know.` })
    }
    if (run.stage !== 'images') continue

    if (c.fits + c.tiff + c.jpeg === 0) {
      findings.push({ level: 'warn', code: 'EMPTY_RUN', run: run.folder, message: `${run.folder} has no images: the run stopped early or every image format was off.` })
    }
    if (c.tiff === 0) findings.push({ level: 'warn', code: 'NO_TIFF', run: run.folder, message: `${run.folder} has no TIFF: the 16-bit stack is not on the scope.` })
    if (c.tiff > 1) findings.push({ level: 'info', code: 'MANY_TIFF', run: run.folder, message: `${run.folder} has ${c.tiff} TIFFs, from exports made during the session.` })
    if (c.fits === 0) findings.push({ level: 'info', code: 'NO_FITS', run: run.folder, message: `${run.folder} has no FITS: raw saving was off, so it cannot be stacked again.` })

    const jpegs = run.files.filter(f => f.kind === 'jpeg').length
    if (c.fits < jpegs && c.fits > 0) {
      findings.push({ level: 'error', code: 'FITS_LT_JPEG', run: run.folder, message: `${run.folder} has fewer FITS (${c.fits}) than JPEGs (${jpegs}): the listing is partial or files are missing.` })
    } else if (c.fits > jpegs && jpegs > 0) {
      findings.push({ level: 'info', code: 'FITS_GT_JPEG', run: run.folder, message: `${plural(c.fits - jpegs, 'frame was', 'frames were')} left out of the stack in ${run.folder}.` })
    }

    const gaps = frameGaps(run.files.filter(f => f.role === 'frame' && f.frameNo !== undefined).map(f => f.frameNo!))
    if (gaps.length > 0) {
      const shown = gaps.slice(0, 5).join(', ') + (gaps.length > 5 ? ', …' : '')
      findings.push({ level: 'warn', code: 'GAP_IN_FRAMES', run: run.folder, message: `${run.folder} is missing ${plural(gaps.length, 'FITS frame')} (${shown}).` })
    }

    const outputs = run.files.filter(f => f.kind === 'json' && f.role === 'output').length
    const stacking = run.files.filter(f => f.kind === 'json' && f.role === 'stacking').length
    const capture = run.files.some(f => f.role === 'capture')
    const sidecarsExpected = c.fits + c.tiff + c.jpeg > 0
    if (sidecarsExpected && (!capture || outputs !== jpegs || stacking !== jpegs)) {
      const why = [!capture && 'no capture.json', outputs !== jpegs && `${outputs} output JSON for ${jpegs} JPEGs`, stacking !== jpegs && `${stacking} stacking JSON for ${jpegs} JPEGs`].filter(Boolean)
      findings.push({ level: 'info', code: 'JSON_MISMATCH', run: run.folder, message: `${run.folder}: ${why.join(', ')}.` })
    }
  }
  if (count(session.rootFiles).other > 0) {
    findings.push({ level: 'info', code: 'UNKNOWN_FILES', message: `The session's top folder holds ${plural(count(session.rootFiles).other, 'file')} of a kind astrorepo does not know.` })
  }
  const unsafe = unsafeRunFinding(session)
  if (unsafe) findings.push(unsafe)
  return { sessionId: session.id, perRun, totals, bytes, findings }
}

/** The worst level among findings; null when there are none. */
export function worstLevel(findings: Finding[]): FindingLevel | null {
  if (findings.some(f => f.level === 'error')) return 'error'
  if (findings.some(f => f.level === 'warn')) return 'warn'
  return findings.length > 0 ? 'info' : null
}

/** The paths of every file in a session, relative to its folder, for telling whether it changed. */
export function sessionFilePaths(session: VesperaSession): string[] {
  return [...session.rootFiles.map(f => f.name), ...session.runs.flatMap(r => r.files.map(f => `${r.folder}/${f.name}`))].sort()
}

/**
 * Compares a session as it was listed with a fresh listing: SESSION_GREW when files were added or
 * changed size (the scope writes FITS while a session runs); null when nothing changed.
 */
export function sessionGrowth(before: VesperaSession, after: VesperaSession): Finding | null {
  const sizes = (s: VesperaSession) =>
    new Map<string, number>([...s.rootFiles.map(f => [f.name, f.sizeBytes] as const), ...s.runs.flatMap(r => r.files.map(f => [`${r.folder}/${f.name}`, f.sizeBytes] as const))])
  const was = sizes(before)
  const now = sizes(after)
  const added = [...now.keys()].filter(p => !was.has(p)).length
  const changed = [...now.keys()].filter(p => was.has(p) && was.get(p) !== now.get(p)).length
  const removed = [...was.keys()].filter(p => !now.has(p)).length
  if (added + changed + removed === 0) return null
  const parts = [added > 0 && `${plural(added, 'file')} added`, changed > 0 && `${plural(changed, 'file')} changed size`, removed > 0 && `${plural(removed, 'file')} gone`].filter(Boolean)
  return { level: 'warn', code: 'SESSION_GREW', message: `The session changed since it was listed: ${parts.join(', ')}. It may still be running.` }
}

// ── Targets ────────────────────────────────────────────────────────────

export type TargetConfidence = 'folder' | 'observation-json' | 'exif' | 'fits-header' | 'manual' | 'unknown'
export type Catalogue = 'M' | 'NGC' | 'IC' | 'Sh2' | 'other'

export interface IngestTarget {
  /** Canonical: "IC 443", "M 31", "NGC 5139", or a free-form name such as "moon". */
  name: string
  catalogue?: Catalogue
  confidence: TargetConfidence
  /** Where each clue came from, the words beside a designation among them. */
  evidence: string[]
  /** The name is not a catalogue designation: the user should look at it before it names a folder. */
  review: boolean
}

/** Common names the scope's labels or EXIF may use, by their catalogue designation. */
export const COMMON_NAMES: Readonly<Record<string, string>> = {
  'andromeda galaxy': 'M 31', andromeda: 'M 31', 'triangulum galaxy': 'M 33', 'orion nebula': 'M 42', pleiades: 'M 45',
  'crab nebula': 'M 1', 'lagoon nebula': 'M 8', 'trifid nebula': 'M 20', 'eagle nebula': 'M 16', 'omega nebula': 'M 17',
  'ring nebula': 'M 57', 'dumbbell nebula': 'M 27', 'whirlpool galaxy': 'M 51', 'pinwheel galaxy': 'M 101',
  "bode's galaxy": 'M 81', 'cigar galaxy': 'M 82', 'sombrero galaxy': 'M 104', 'hercules cluster': 'M 13',
  'jellyfish nebula': 'IC 443', 'heart nebula': 'IC 1805', 'soul nebula': 'IC 1848', 'horsehead nebula': 'IC 434',
  'north america nebula': 'NGC 7000', 'pelican nebula': 'IC 5070', 'rosette nebula': 'NGC 2237', 'veil nebula': 'NGC 6960',
  'carina nebula': 'NGC 3372', 'eta carinae nebula': 'NGC 3372', 'omega centauri': 'NGC 5139', 'tarantula nebula': 'NGC 2070',
  'cat\'s paw nebula': 'NGC 6334', 'helix nebula': 'NGC 7293', 'flaming star nebula': 'IC 405', 'elephant\'s trunk nebula': 'IC 1396'
}

const DESIGNATION = /^\s*(?<prefix>m|ngc|ic|sh\s*-?\s*2)[\s_-]*(?<num>\d{1,4})(?=$|[\s_-])(?<rest>.*)$/i
const DESIGNATION_ANYWHERE = /(?:^|[^a-z0-9])(?<prefix>m|ngc|ic|sh\s*-?\s*2)[\s_-]*(?<num>\d{1,4})(?![0-9a-z])/i

const prefixOf = (raw: string): Exclude<Catalogue, 'other'> => {
  const p = raw.toLowerCase().replace(/[\s-]/g, '')
  return p === 'm' ? 'M' : p === 'ngc' ? 'NGC' : p === 'ic' ? 'IC' : 'Sh2'
}

const commonKey = (s: string) => s.toLowerCase().replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim()

export interface NormalisedName {
  name: string
  catalogue?: Catalogue
  /** Words beside a designation, kept as evidence. */
  remainder: string | null
  review: boolean
}

/**
 * Normalises a raw name. A leading catalogue designation is taken even with words after it
 * (M16_15_18 → M 16, "NGC5139 omega centauri" → NGC 5139), and written as prefix, one space, number.
 * A known common name maps to its designation. Anything else is kept whole, trimmed, for review.
 * Null for a blank name.
 */
export function normaliseTargetName(raw: string): NormalisedName | null {
  const text = raw.trim()
  if (text === '') return null
  const m = DESIGNATION.exec(text)
  if (m?.groups) {
    const catalogue = prefixOf(m.groups.prefix)
    const rest = m.groups.rest.replace(/^[\s_-]+/, '').trim()
    return { name: `${catalogue} ${Number(m.groups.num)}`, catalogue, remainder: rest === '' ? null : rest, review: false }
  }
  const common = COMMON_NAMES[commonKey(text)]
  if (common) return { name: common, catalogue: prefixOf(common.split(' ')[0]), remainder: text, review: false }
  return { name: text, catalogue: 'other', remainder: null, review: true }
}

/** Finds a designation or common name anywhere in free text, such as an EXIF description; null when none. */
export function targetInText(text: string): NormalisedName | null {
  const m = DESIGNATION_ANYWHERE.exec(text)
  if (m?.groups) {
    const catalogue = prefixOf(m.groups.prefix)
    return { name: `${catalogue} ${Number(m.groups.num)}`, catalogue, remainder: null, review: false }
  }
  const key = commonKey(text)
  const hit = Object.keys(COMMON_NAMES).filter(k => key.includes(k)).sort((a, b) => b.length - a.length)[0]
  return hit ? { name: COMMON_NAMES[hit], catalogue: prefixOf(COMMON_NAMES[hit].split(' ')[0]), remainder: null, review: false } : null
}

/** Keys observation.json may name its target by, in the order they are tried. */
export const OBSERVATION_TARGET_KEYS: readonly string[] = ['target', 'targetName', 'target_name', 'object', 'objectName', 'object_name', 'dsoName', 'dso', 'name']

/**
 * The target name in an observation.json, looked for under the known keys at the top level and
 * one level down. Null when the text is not JSON or names no target. Never throws.
 */
export function targetFromObservationJson(text: string): string | null {
  let doc: unknown
  try {
    doc = JSON.parse(text)
  } catch {
    return null
  }
  const pick = (o: unknown): string | null => {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null
    for (const k of OBSERVATION_TARGET_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(o, k)) continue
      const v = (o as Record<string, unknown>)[k]
      if (typeof v === 'string' && v.trim() !== '') return v.trim()
      const inner = pick(v)
      if (inner) return inner
    }
    return null
  }
  const top = pick(doc)
  if (top) return top
  if (doc && typeof doc === 'object' && !Array.isArray(doc)) {
    for (const v of Object.values(doc as Record<string, unknown>)) {
      const inner = pick(v)
      if (inner) return inner
    }
  }
  return null
}

/** One rung of the identification ladder, as read: null when it was not read or named nothing. */
export interface TargetClue {
  source: Exclude<TargetConfidence, 'manual' | 'unknown'>
  raw: string | null
}

const RUNGS: TargetClue['source'][] = ['folder', 'observation-json', 'exif', 'fits-header']

/**
 * Resolves a target from the clues read, cheapest rung first: the first rung that names one wins
 * and its name is the target. A later rung that names a different target raises TARGET_MISMATCH
 * at warn; it never changes the target. No clue gives an unknown target.
 */
export function resolveTarget(clues: TargetClue[]): { target: IngestTarget; findings: Finding[] } {
  const ordered = [...clues].sort((a, b) => RUNGS.indexOf(a.source) - RUNGS.indexOf(b.source))
  const named = ordered.flatMap(c => {
    if (c.raw === null) return []
    const n = c.source === 'exif' ? targetInText(c.raw) ?? normaliseTargetName(c.raw) : normaliseTargetName(c.raw)
    return n ? [{ clue: c, n }] : []
  })
  if (named.length === 0) {
    return { target: { name: 'Unknown', confidence: 'unknown', evidence: ordered.map(c => `${c.source}: nothing`), review: true }, findings: [] }
  }
  const [win, ...rest] = named
  const evidence = named.map(({ clue, n }) => `${clue.source}: ${clue.raw}${n.remainder && n.remainder !== clue.raw ? ` (beside the name: ${n.remainder})` : ''}`)
  const findings: Finding[] = rest
    .filter(({ n }) => n.name.toLowerCase() !== win.n.name.toLowerCase())
    .map(({ clue, n }) => ({ level: 'warn', code: 'TARGET_MISMATCH', message: `The ${win.clue.source} says ${win.n.name} but the ${clue.source} says ${n.name}; keeping ${win.n.name}.` }) as Finding)
  return {
    target: { name: win.n.name, ...(win.n.catalogue ? { catalogue: win.n.catalogue } : {}), confidence: win.clue.source, evidence, review: win.n.review },
    findings
  }
}

/** The user's own name for a target. Keeps what astrorepo thought before in the evidence. Null for a blank name. */
export function overrideTarget(previous: IngestTarget, typed: string): IngestTarget | null {
  const n = normaliseTargetName(typed)
  if (!n) return null
  return {
    name: n.name,
    ...(n.catalogue ? { catalogue: n.catalogue } : {}),
    confidence: 'manual',
    evidence: [...previous.evidence, `manual: ${typed.trim()} (was ${previous.name}, from the ${previous.confidence === 'unknown' ? 'nothing found' : previous.confidence})`],
    review: false
  }
}

/** Whether the Transfer button is on: no error findings, and a target astrorepo named with confidence or the user named. */
export function canTransfer(findings: Finding[], target: IngestTarget): boolean {
  return target.confidence !== 'unknown' && !target.review && !findings.some(f => f.level === 'error')
}

// ── Destination folder names ───────────────────────────────────────────

/** The kinds a copy may include, in the order their tokens appear in a folder name. */
export type IncludedKind = Exclude<VesperaFileKind, 'other'>
export const INCLUDED_KINDS: readonly IncludedKind[] = ['fits', 'tiff', 'jpeg', 'json']
export const KIND_TOKEN: Readonly<Record<IncludedKind, string>> = { fits: 'FIT', tiff: 'TIF', jpeg: 'JPG', json: 'JSON' }

/** The longest folder name astrorepo makes; only the target part is ever shortened. */
export const MAX_FOLDER_NAME = 80

/** The single grammar for a destination folder: generated names always match it, and it reads them back. */
export const DESTINATION_FOLDER = /^(?<target>[A-Za-z0-9][A-Za-z0-9-]*)_(?<date>\d{4}-\d{2}-\d{2})(?<kinds>(?:_(?:FIT|TIF|JPG|JSON)=\d+)+)(?:_(?<dup>[2-9]|[1-9]\d+))?$/
const KIND_TOKENS = /_(FIT|TIF|JPG|JSON)=(\d+)/g

/**
 * The target part of a folder name: a designation loses its spaces (M 31 → M31, IC 443 → IC443,
 * Sh2 155 → Sh2-155); any other name has every run of characters outside A-Z, a-z, 0-9 and - turned
 * into one -, with - trimmed from both ends. "target" when nothing is left.
 */
export function folderTarget(target: Pick<IngestTarget, 'name' | 'catalogue'>): string {
  const designation = /^(M|NGC|IC|Sh2) (\d+)$/.exec(target.name)
  if (designation) return designation[1] === 'Sh2' ? `Sh2-${designation[2]}` : `${designation[1]}${designation[2]}`
  const cleaned = target.name.replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
  return cleaned === '' ? 'target' : cleaned
}

export interface FolderNameInput {
  target: Pick<IngestTarget, 'name' | 'catalogue'>
  /** YYYY-MM-DD, from the session's folder name. */
  date: string
  /** Files of each included kind; a kind that is absent is not included. */
  counts: Partial<Record<IncludedKind, number>>
  /** 2 or more for a second folder of the same name from a different session. */
  duplicate?: number
}

/**
 * The destination folder's name: {target}_{date}, one _{KIND}={count} per included kind in the
 * order FIT, TIF, JPG, JSON, and _{n} for a duplicate. Capped at MAX_FOLDER_NAME characters by
 * shortening the target part only. Throws when no kind is included or the date is not a date.
 */
export function destinationFolderName(input: FolderNameInput): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error(`Not a date: ${input.date}`)
  const kinds = INCLUDED_KINDS.filter(k => input.counts[k] !== undefined)
  if (kinds.length === 0) throw new Error('A copy includes at least one kind of file.')
  const tokens = kinds.map(k => `_${KIND_TOKEN[k]}=${Math.max(0, Math.trunc(input.counts[k]!))}`).join('')
  const dup = input.duplicate !== undefined && input.duplicate >= 2 ? `_${Math.trunc(input.duplicate)}` : ''
  const tail = `_${input.date}${tokens}${dup}`
  const room = Math.max(1, MAX_FOLDER_NAME - tail.length)
  let target = folderTarget(input.target).slice(0, room).replace(/-+$/, '')
  if (target === '') target = 'target'.slice(0, room)
  return `${target}${tail}`
}

export interface ParsedFolderName {
  target: string
  date: string
  counts: Partial<Record<IncludedKind, number>>
  duplicate: number | null
}

/** Reads a destination folder's name back; null when it is not one astrorepo made. */
export function parseDestinationFolder(name: string): ParsedFolderName | null {
  const m = DESTINATION_FOLDER.exec(name)
  if (!m?.groups) return null
  const byToken = Object.fromEntries(INCLUDED_KINDS.map(k => [KIND_TOKEN[k], k])) as Record<string, IncludedKind>
  const counts: Partial<Record<IncludedKind, number>> = {}
  for (const t of m.groups.kinds.matchAll(KIND_TOKENS)) counts[byToken[t[1]]] = Number(t[2])
  return { target: m.groups.target, date: m.groups.date, counts, duplicate: m.groups.dup ? Number(m.groups.dup) : null }
}

// ── Transfer ───────────────────────────────────────────────────────────

/** One file a transfer copies, relative to the session folder on the scope and to the destination folder. */
export interface TransferItem {
  /** run/file, or file for a top-level file; the same path on both sides. */
  path: string
  kind: IncludedKind
  sizeBytes: number
  frameNo: number | null
  runOrder: number | null
}

const KIND_ORDER: Record<IncludedKind, number> = { fits: 0, jpeg: 1, tiff: 2, json: 3 }

/** The kinds a transfer copies unless Settings says otherwise: the raw frames and the scope's TIFF stack. */
export const DEFAULT_INCLUDE: readonly IncludedKind[] = ['fits', 'tiff']

// eslint-disable-next-line no-control-regex
const WINDOWS_UNSAFE = /[<>:"/\\|?*\u0000-\u001f\u007f]|[. ]$|^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i

/** Whether a folder or file name from the scope can be kept as it is on a Windows disk. */
export function isLocalName(name: string): boolean {
  return name.length > 0 && name.length <= 255 && name !== '.' && name !== '..' && !WINDOWS_UNSAFE.test(name)
}

/** Runs and files whose names cannot be kept on the PC, which a transfer leaves on the scope. */
export function unsafeRunFinding(session: VesperaSession): Finding | null {
  const runs = [
    ...session.rootFiles.filter(f => !isLocalName(f.name)).map(f => f.name),
    ...session.runs.flatMap(r => (isLocalName(r.folder) ? r.files.filter(f => !isLocalName(f.name)).map(f => `${r.folder}/${f.name}`) : [r.folder]))
  ]
  if (runs.length === 0) return null
  return { level: 'warn', code: 'UNSAFE_NAME', message: `${runs.join(', ')} ${runs.length === 1 ? 'has a name' : 'have names'} Windows would not keep, so ${runs.length === 1 ? 'it is' : 'they are'} not copied.` }
}

/** The room a transfer needs where copies land: the bytes still to copy and 1%, so the disk is never filled to the last byte. */
export function transferRoom(bytesToCopy: number, freeBytes: number | null): { neededBytes: number; shortBytes: number | null } {
  const neededBytes = Math.ceil(Math.max(0, bytesToCopy) * 1.01)
  return { neededBytes, shortBytes: freeBytes === null || neededBytes <= freeBytes ? null : neededBytes - freeBytes }
}

/** Bytes as a person reads them: 512 B, 1.5 KB, 20.0 MB. */
export function bytesText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let n = bytes / 1024
  let u = 0
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024
    u++
  }
  return `${n.toFixed(1)} ${units[u]}`
}

/**
 * The files a transfer copies, in copy order: FITS by frame number, then JPEG, then TIFF, then
 * JSON, so the big few TIFFs come last and a link that drops late loses the least work. Within a
 * kind, top-level files come first, then each run in its order, by frame number. Only the kinds asked for, never a file of a kind astrorepo does not know, and never a run or file whose name Windows would not keep as it is.
 */
export function planTransfer(session: VesperaSession, include: IncludedKind[]): TransferItem[] {
  const wanted = new Set(include)
  const items: TransferItem[] = [
    ...session.rootFiles.map(f => ({ f, run: null as VesperaRun | null })),
    ...session.runs.flatMap(r => r.files.map(f => ({ f, run: r })))
  ].flatMap(({ f, run }) =>
    f.kind !== 'other' && wanted.has(f.kind) && isLocalName(f.name) && (run === null || isLocalName(run.folder))
      ? [{ path: run ? `${run.folder}/${f.name}` : f.name, kind: f.kind, sizeBytes: f.sizeBytes, frameNo: f.frameNo ?? null, runOrder: run ? run.order ?? Number.MAX_SAFE_INTEGER : -1 }]
      : []
  )
  return items.sort(
    (a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      (a.runOrder ?? 0) - (b.runOrder ?? 0) ||
      (a.frameNo ?? Infinity) - (b.frameNo ?? Infinity) ||
      (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  )
}

/**
 * Files of each included kind in a plan, as the folder name carries them. FITS is always named, as
 * the raw frames are what a folder is for; another kind is named only when the session has some, so
 * a night with no TIFF is M31_2026-10-14_FIT=400 rather than ..._TIF=0.
 */
export function planCounts(items: TransferItem[], include: IncludedKind[]): Partial<Record<IncludedKind, number>> {
  const counts: Partial<Record<IncludedKind, number>> = {}
  for (const k of INCLUDED_KINDS) {
    const n = items.filter(i => i.kind === k).length
    if (include.includes(k) && (k === 'fits' || n > 0)) counts[k] = n
  }
  return counts
}

/** Where a partly copied file is kept until its size is right. */
export const PART_SUFFIX = '.part'
/** The transfer's own record, in the destination folder, written before the first byte. */
export const TRANSFER_FILE = 'astrorepo.transfer.json'
/** What a finished copy holds, in the destination folder. */
export const MANIFEST_FILE = 'astrorepo.manifest.json'

/** How many times one file is fetched again when its size comes out wrong. */
export const SIZE_ATTEMPTS = 3

export type TransferState = 'planned' | 'running' | 'paused' | 'verifying' | 'done' | 'failed'

export interface TransferJob {
  id: string
  sessionId: string
  /** The session folder's path on the scope. */
  sessionPath: string
  target: IngestTarget
  /** Where copies land (Settings). */
  destinationRoot: string
  /** The target's folder under it, which the home scan matches to the target. */
  targetFolder: string
  /** This session's folder under the target's, named by the destination grammar. */
  destinationFolder: string
  include: IncludedKind[]
  items: TransferItem[]
  state: TransferState
  /** Paths copied and checked, in the order they were committed. */
  committed: string[]
  copiedBytes: number
  totalBytes: number
  /** Findings live when Transfer was pressed, and any raised since. */
  findings: Finding[]
  /** Why the job is paused or failed. */
  reason: string | null
  /** The session's start, scope-local, from its folder's name. */
  startedAt: string | null
  /** When the session was listed for this job. */
  listedAt: string
  createdAt: string
  updatedAt: string
}

export interface ManifestFile {
  remote: string
  local: string
  sizeBytes: number
  sha256: string
}

/** The record a finished copy carries, so a folder in the repository says what it is. */
export interface TransferManifest {
  schema: 1
  sessionId: string
  target: IngestTarget
  folder: string
  include: IncludedKind[]
  /** Files of each included kind actually copied (it can differ from the name's counts: NAME_COUNT_STALE). */
  counts: Partial<Record<IncludedKind, number>>
  files: ManifestFile[]
  findings: Finding[]
  startedAt: string | null
  copiedAt: string
}

/** Reads a manifest or transfer record's session id; null when the text is not one. Never throws. */
export function recordSessionId(text: string): string | null {
  try {
    const doc = JSON.parse(text) as unknown
    if (doc && typeof doc === 'object' && typeof (doc as { sessionId?: unknown }).sessionId === 'string') return (doc as { sessionId: string }).sessionId
  } catch {
    // not a record
  }
  return null
}

/**
 * NAME_COUNT_STALE when the session now holds other counts than the folder's name carries (it grew
 * after the copy was planned); null when they agree. The folder is never renamed.
 */
export function nameCountFinding(folder: string, now: Partial<Record<IncludedKind, number>>): Finding | null {
  const parsed = parseDestinationFolder(folder)
  if (!parsed) return null
  const stale = INCLUDED_KINDS.filter(k => parsed.counts[k] !== undefined && parsed.counts[k] !== (now[k] ?? 0))
  if (stale.length === 0) return null
  const what = stale.map(k => `${KIND_TOKEN[k]}=${parsed.counts[k]} in the name, ${now[k] ?? 0} on the scope now`).join('; ')
  return { level: 'info', code: 'NAME_COUNT_STALE', message: `The folder's name was set when the copy was planned (${what}). The folder keeps its name; the manifest lists what was copied.` }
}
