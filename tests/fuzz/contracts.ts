import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  KNOWN_SIRIL_FAILURES,
  SYQON_STEPS,
  astapCatalogues,
  bayerChannels,
  explainSirilFailure,
  filterFamily,
  formatClock,
  frameFileKind,
  namedFrames,
  parseAstapResult,
  parseClock,
  parseLiveProgress,
  parseMpcComet,
  parseSirilSolve,
  parseStackManifest,
  parseSyqonModels,
  parseToolVersion,
  splitSirilScript,
  stepScript,
  type SolveOutcome
} from '@astro/domain'
import { parseFitsFile, parseFitsHeaders, parseHeaderCard } from '../../src/main/fits/parser'
import { readFitsImage } from '../../src/main/fits/image-reader'
import { readPngImage } from '../../src/main/fits/png-reader'
import { readTiffExif, TiffReadError } from '../../src/main/raw/tiff-exif'
import { withinBudget, withinBudgetAsync } from './fuzz-config'

/**
 * The contract every parser of untrusted input is fuzzed against (FUZ-001 to FUZ-004): it returns
 * its documented result or typed failure, throws nothing else, finishes within the run budget, and
 * what it returns is well formed. One checker per target, shared by the fuzz tests and the corpus
 * replay, so a corpus file is checked exactly as the fuzzer checked it.
 */

export class ContractError extends Error {}

export function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ContractError(message)
}

const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n)
const show = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === 'number' && !Number.isFinite(x) ? String(x) : x))

/** A plate solve's outcome: a reason, or a field that is a real place on the sky. */
export function checkSolveOutcome(out: SolveOutcome, widthPx: number, heightPx: number): void {
  if (!out.ok) {
    ensure(typeof out.reason === 'string' && out.reason.length > 0, 'a failed solve says why')
    return
  }
  const f = out.field
  ensure(finite(f.raDeg) && f.raDeg >= 0 && f.raDeg < 360, `RA in [0, 360): ${show(f)}`)
  ensure(finite(f.decDeg) && Math.abs(f.decDeg) <= 90, `Dec within ±90: ${show(f)}`)
  ensure(finite(f.rotationDeg) && f.rotationDeg > -180 && f.rotationDeg <= 180, `rotation in (-180, 180]: ${show(f)}`)
  ensure(finite(f.scaleArcsec) && f.scaleArcsec > 0, `a positive scale: ${show(f)}`)
  ensure(f.widthPx === widthPx && f.heightPx === heightPx, 'the image size it was given')
}

const KNOWN_FAILURE_REASONS = new Set(KNOWN_SIRIL_FAILURES.map(k => k.reason))
const SYQON_MODEL_ID = /^[a-z0-9][a-z0-9._-]*$/i

/** Text parsers in the domain: each takes one string. */
export const TEXT_CONTRACTS: Record<string, (input: string) => void> = {
  parseMpcComet: input => {
    const out = withinBudget('parseMpcComet', () => parseMpcComet(input))
    if (!out.ok) {
      ensure(typeof out.error === 'string' && out.error.length > 0, 'a failed parse says which part is wrong')
      return
    }
    const o = out.orbit
    ensure(o.q > 0 && o.q <= 100 && o.e >= 0 && o.e <= 10, `q and e in range: ${show(o)}`)
    ensure(o.inclinationDeg >= 0 && o.inclinationDeg <= 180, 'inclination in range')
    ensure(o.nodeDeg >= 0 && o.nodeDeg <= 360 && o.periDeg >= 0 && o.periDeg <= 360, 'angles in range')
    ensure(Number.isFinite(o.perihelionAt.getTime()), 'a real perihelion date')
    ensure(o.epoch === null || /^\d{4}-\d{2}-\d{2}$/.test(o.epoch), 'an epoch as YYYY-MM-DD')
    ensure(typeof o.name === 'string' && o.name.length > 0, 'a name')
  },
  parseToolVersion: input => {
    const out = withinBudget('parseToolVersion', () => parseToolVersion(input))
    ensure(out === null || (/^\d+(\.\d+)+/.test(out) && input.includes(out)), `a dotted version from the output: ${show(out)}`)
  },
  astapCatalogues: input => {
    const listing = input.split('\n')
    const out = withinBudget('astapCatalogues', () => astapCatalogues(listing))
    ensure(out.every(d => /^[A-Z]\d{2}$/.test(d.name) && Number.isInteger(d.files) && d.files > 0), `database names and counts: ${show(out)}`)
    ensure(out.reduce((n, d) => n + d.files, 0) <= listing.length, 'no more files than listed')
    ensure(out.every((d, i) => i === 0 || out[i - 1].name < d.name), 'sorted by name, each once')
  },
  parseAstapResult: input => {
    const out = withinBudget('parseAstapResult', () => parseAstapResult(input, 4144, 2822))
    checkSolveOutcome(out, 4144, 2822)
  },
  parseSirilSolve: input => {
    const out = withinBudget('parseSirilSolve', () => parseSirilSolve(input, 3008, 3008))
    checkSolveOutcome(out, 3008, 3008)
  },
  parseSyqonModels: input => {
    const out = withinBudget('parseSyqonModels', () => parseSyqonModels(input))
    const ids = new Set<string>()
    for (const m of out) {
      ensure(SYQON_MODEL_ID.test(m.id) && !ids.has(m.id), `a model id, once: ${show(m)}`)
      ids.add(m.id)
      ensure(typeof m.available === 'boolean' && typeof m.status === 'string' && m.status.length > 0, `availability: ${show(m)}`)
      ensure(m.step === null || (SYQON_STEPS as readonly unknown[]).includes(m.step), `a known step or none: ${m.id} → ${String(m.step)}`)
      ensure(typeof m.description === 'string', 'a description')
    }
  },
  parseLiveProgress: input => {
    const out = withinBudget('parseLiveProgress', () => parseLiveProgress(input))
    if (out === null) {
      ensure(input.trim() === '', 'null only when there is no line')
      return
    }
    ensure(out.line.length > 0 && out.line.length <= 200 && !/[\r\n]/.test(out.line), `one short line: ${show(out)}`)
    ensure(out.percent === null || (finite(out.percent) && out.percent >= 0 && out.percent <= 100), `a percentage in range: ${show(out)}`)
  },
  splitSirilScript: input => {
    const out = withinBudget('splitSirilScript', () => splitSirilScript(input))
    if (out === null) return
    ensure(out.length > 0, 'null rather than no steps')
    out.forEach((step, i) => {
      ensure(step.index === i, 'steps numbered in order')
      ensure(step.commands.length > 0, 'every step runs something')
      ensure(!step.cwd.split('/').includes('..') && !/^([a-z]:|\/|~)/i.test(step.cwd), `a step never starts outside the work folder: ${step.cwd}`)
      ensure(typeof stepScript(step) === 'string', 'a step script')
    })
  },
  explainSirilFailure: input => {
    const out = withinBudget('explainSirilFailure', () => explainSirilFailure(input))
    ensure(out === null || (KNOWN_FAILURE_REASONS.has(out.reason) && out.fix.length > 0), `a known failure or none: ${show(out)}`)
  },
  parseStackManifest: input => {
    const out = withinBudget('parseStackManifest', () => parseStackManifest(input))
    if (out === null) return
    ensure(out.format === 'astrorepo-stack-manifest' && out.version === 1, 'only a manifest this version reads')
    // What the archive does with a manifest must not throw either.
    const frames = withinBudget('namedFrames', () => namedFrames([{ path: 'r.fit.astrorepo.json', manifest: out }]))
    ensure(frames.every(f => typeof f.name === 'string'), 'named frames')
  },
  parseClock: input => {
    const out = withinBudget('parseClock', () => parseClock(input))
    if (out === null) return
    ensure(Number.isInteger(out) && out >= 0 && out < 1440, `minutes in a day: ${out}`)
    ensure(parseClock(formatClock(out)) === out, 'reads back as written')
  },
  frameFileKind: input => {
    const out = withinBudget('frameFileKind', () => frameFileKind(input))
    ensure(out === null || out === 'fits' || out === 'raw' || out === 'raw-unread', `a kind or none: ${String(out)}`)
    if (out !== null) ensure(input.includes('.'), 'only a name with an extension has a kind')
  },
  bayerChannels: input => {
    const out = withinBudget('bayerChannels', () => bayerChannels(input))
    if (out === null) return
    ensure(out.length === 4 && out.filter(c => c === 'G').length === 2 && out.includes('R') && out.includes('B'), `a 2×2 Bayer cell: ${show(out)}`)
  },
  filterFamily: input => {
    const out = withinBudget('filterFamily', () => filterFamily(input))
    ensure(out === null || out === 'narrowband' || out === 'broadband', `a family or none: ${String(out)}`)
  }
}

// ── Binary readers ──────────────────────────────────────────────────────

let scratch: string | null = null
let written = 0
/** A file holding these bytes, in a temporary folder removed when the process exits. */
export function scratchFile(bytes: Uint8Array, ext: string): string {
  if (!scratch) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-fuzz-'))
    scratch = dir
    process.once('exit', () => fs.rmSync(dir, { recursive: true, force: true }))
  }
  const file = path.join(scratch, `in-${written++ % 4}${ext}`)
  fs.writeFileSync(file, bytes)
  return file
}

/** Errors the readers throw on purpose carry a message for the user; anything else is a crash. */
function isDocumentedError(err: unknown): err is Error {
  return err instanceof Error && err.constructor === Error && err.message.length > 0
}

const FITS_HEADER_ERRORS = /^No END card/

function checkHeaders(headers: ReturnType<typeof parseFitsHeaders>): void {
  for (const h of headers.headers) {
    ensure(h.keyword.length <= 8 && h.raw.length <= 80, `a card's keyword and text: ${show(h)}`)
    ensure(h.value === null || ['string', 'boolean'].includes(typeof h.value) || typeof h.value === 'number', 'a card value type')
  }
}

/** The binary readers: each takes a file's bytes. */
export const BINARY_CONTRACTS: Record<string, (bytes: Uint8Array) => Promise<void>> = {
  parseFitsHeaders: async bytes => {
    const file = scratchFile(bytes, '.fit')
    try {
      checkHeaders(withinBudget('parseFitsHeaders', () => parseFitsHeaders(file)))
    } catch (err) {
      if (err instanceof ContractError) throw err
      ensure(isDocumentedError(err) && FITS_HEADER_ERRORS.test(err.message), `parseFitsHeaders threw ${String(err)}`)
    }
    // The scan's entry point never throws: a file it cannot read comes back invalid with the reason.
    const result = withinBudget('parseFitsFile', () => parseFitsFile(file, { computeStats: true }))
    ensure(typeof result.isValid === 'boolean', 'a validity verdict')
    if (!result.isValid) ensure(typeof result.error === 'string' && result.error.length > 0, 'an invalid file says why')
    if (result.imageStats) ensure(!(result.imageStats.min > result.imageStats.max), `stats in order: ${show(result.imageStats)}`)
  },
  readFitsImage: async bytes => {
    const file = scratchFile(bytes, '.fit')
    try {
      const image = await withinBudgetAsync('readFitsImage', () => readFitsImage(file))
      ensure(Number.isInteger(image.width) && image.width > 0 && Number.isInteger(image.height) && image.height > 0, 'a real size')
      ensure(image.planes.length >= 1 && image.planes.length <= 4, 'one to four planes')
      ensure(image.planes.every(p => p.length === image.width * image.height), 'every plane the size of the image')
    } catch (err) {
      if (err instanceof ContractError) throw err
      ensure(isDocumentedError(err), `readFitsImage threw ${String(err)}`)
    }
  },
  readPngImage: async bytes => {
    const file = scratchFile(bytes, '.png')
    try {
      const image = await withinBudgetAsync('readPngImage', () => readPngImage(file))
      ensure(image.width > 0 && image.height > 0, 'a real size')
      ensure(image.planes.length === 1 || image.planes.length === 3, 'grey or colour planes')
      ensure(image.planes.every(p => p.length === image.width * image.height), 'every plane the size of the image')
    } catch (err) {
      if (err instanceof ContractError) throw err
      ensure(isDocumentedError(err), `readPngImage threw ${String(err)}`)
    }
  },
  readTiffExif: async bytes => {
    const buf = Buffer.from(bytes)
    // The source behaves like a file: a read past the end returns what there is.
    const source = { size: buf.length, read: async (offset: number, length: number) => buf.subarray(offset, offset + length) }
    try {
      const exif = await withinBudgetAsync('readTiffExif', () => readTiffExif(source))
      for (const key of ['exposureSec', 'iso', 'width', 'height', 'temperatureC', 'focalMm', 'pixelUm'] as const) {
        ensure(exif[key] === null || finite(exif[key]), `${key} is a number or null: ${show(exif)}`)
      }
      for (const key of ['make', 'model', 'dateTimeOriginal', 'subSec', 'offsetTime'] as const) {
        ensure(exif[key] === null || typeof exif[key] === 'string', `${key} is text or null`)
      }
    } catch (err) {
      if (err instanceof ContractError) throw err
      ensure(err instanceof TiffReadError, `readTiffExif threw ${String(err)}`)
    }
  },
  fitsCardsAgree: async bytes => {
    // The bytes are a card after its keyword: the scanner and the image reader must read it alike (FUZ-005).
    const rest = Buffer.from(bytes).toString('latin1')
    const cardText = `FUZZKEY ${rest}`.padEnd(80).slice(0, 80)
    const head = ['SIMPLE  =                    T', 'BITPIX  =                    8', 'NAXIS   =                    2', 'NAXIS1  =                    1', 'NAXIS2  =                    1']
      .map(c => c.padEnd(80))
      .join('')
    const file = scratchFile(Buffer.concat([Buffer.from((head + cardText + 'END'.padEnd(80)).padEnd(2880), 'latin1'), Buffer.alloc(2880)]), '.fit')
    const scanned = parseFitsFile(file).headerMap.get('FUZZKEY')?.value ?? null
    const read = (await readFitsImage(file)).headers.get('FUZZKEY') ?? null
    ensure(Object.is(scanned, read), `scanner ${show(scanned)} but image reader ${show(read)} for ${show(cardText)}`)
    ensure(Object.is(parseHeaderCard(cardText).value, scanned), "the card parser is the scanner's")
  },
  parseHeaderCard: async bytes => {
    const card = Buffer.from(bytes).toString('latin1').padEnd(80).slice(0, 80)
    const rec = withinBudget('parseHeaderCard', () => parseHeaderCard(card))
    ensure(rec.raw === card && rec.keyword === card.slice(0, 8).trimEnd(), 'keyword and raw text kept')
    ensure(rec.value === null || typeof rec.value !== 'number' || Number.isFinite(rec.value), `a finite number: ${show(rec)}`)
  }
}
