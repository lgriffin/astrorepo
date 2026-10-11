import { describe, it } from 'vitest'
import zlib from 'zlib'
import fc from 'fast-check'
import { encodeGreyscalePng } from '../../src/main/fits/png-encoder'
import { png } from '../helpers/png'
import { cr2Bytes, tiffBytes, type TiffEntry } from '../helpers/tiff'
import { BINARY_CONTRACTS } from './contracts'
import { FUZZ_TEST_TIMEOUT_MS, fuzzParams, mutatedBytes } from './fuzz-config'

const PNG_SEEDS: Buffer[] = [
  encodeGreyscalePng(3, 2, new Uint8Array([0, 10, 20, 30, 40, 255])),
  png(3, 5, 6, 8, Array.from({ length: 5 }, (_, y) => Array.from({ length: 12 }, (_, i) => (y * 31 + i * 7) & 0xff))),
  png(2, 1, 0, 16, [[0x12, 0x34, 0xff, 0xff]]),
  png(2, 1, 3, 8, [[1, 0]], { palette: [10, 20, 30, 40, 50, 60] }),
  png(2, 2, 2, 8, [[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12]])
]

const TIFF_SEEDS: Buffer[] = [
  cr2Bytes({ temperature: [18, 1] }),
  cr2Bytes({ offset: null }),
  tiffBytes({
    littleEndian: false,
    ifd0: [
      { tag: 0x0100, type: 4, values: [160] },
      { tag: 0x0101, type: 4, values: [120] },
      { tag: 0x010f, type: 2, values: 'NIKON CORPORATION' }
    ],
    subIfds: [[{ tag: 0x0100, type: 4, values: [7380] }, { tag: 0x0101, type: 4, values: [4928] }]],
    exif: [
      { tag: 0x829a, type: 5, values: [[1, 250]] },
      { tag: 0x9003, type: 2, values: '2025:08:01 23:59:58' },
      { tag: 0x9400, type: 10, values: [[-35, 10]] }
    ]
  }),
  tiffBytes({ magic: 0x55, ifd0: [{ tag: 0x0100, type: 3, values: [10] }] })
].map(b => Buffer.from(b))

const pngChunk = (kind: string, body: Buffer, length = body.length) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(length >>> 0)
  return Buffer.concat([len, Buffer.from(kind, 'latin1'), body, Buffer.alloc(4)])
}
/** A PNG put together from a generated header and chunks: sizes, depths and types valid or not, data that inflates to too little or too much. */
const generatedPng = fc
  .record({
    width: fc.oneof(fc.integer({ min: 0, max: 8 }), fc.constantFrom(0xffffffff, 0x10000, 20000)),
    height: fc.oneof(fc.integer({ min: 0, max: 8 }), fc.constantFrom(0xffffffff, 0x10000, 20000)),
    depth: fc.constantFrom(1, 2, 4, 8, 16, 0, 255),
    type: fc.constantFrom(0, 2, 3, 4, 6, 1, 7),
    interlace: fc.constantFrom(0, 0, 0, 1),
    chunks: fc.array(
      fc.oneof(
        fc.uint8Array({ maxLength: 300 }).map(raw => pngChunk('IDAT', zlib.deflateSync(Buffer.from(raw)))),
        fc.uint8Array({ maxLength: 64 }).map(raw => pngChunk('IDAT', Buffer.from(raw))),
        fc.uint8Array({ maxLength: 800 }).map(raw => pngChunk('PLTE', Buffer.from(raw))),
        fc.tuple(fc.constantFrom('IDAT', 'PLTE', 'tEXt'), fc.nat({ max: 0xffffffff })).map(([kind, length]) => pngChunk(kind, Buffer.alloc(0), length)),
        fc.constant(pngChunk('IEND', Buffer.alloc(0)))
      ),
      { maxLength: 5 }
    )
  })
  .map(p => {
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(p.width >>> 0, 0)
    ihdr.writeUInt32BE(p.height >>> 0, 4)
    ihdr[8] = p.depth
    ihdr[9] = p.type
    ihdr[12] = p.interlace
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk('IHDR', ihdr), ...p.chunks])
  })

/** Tags the reader follows or reads, including the ones that point at other directories. */
const TAGS = [0x00fe, 0x0100, 0x0101, 0x010f, 0x0110, 0x0132, 0x014a, 0x829a, 0x8769, 0x8827, 0x8833, 0x9003, 0x9010, 0x9011, 0x920a, 0x9291, 0x9400, 0xa002, 0xa003, 0xa20e, 0xa210]
const u32 = fc.oneof(fc.constantFrom(0, 1, 8, 0x7fffffff, 0xffffffff), fc.nat({ max: 0xffffffff }), fc.nat({ max: 600 }))
const s32 = fc.integer({ min: -0x80000000, max: 0x7fffffff })
const entry: fc.Arbitrary<TiffEntry> = fc.oneof(
  fc.record({ tag: fc.constantFrom(...TAGS), type: fc.constant(2 as const), values: fc.string({ maxLength: 24 }) }),
  fc.record({ tag: fc.constantFrom(...TAGS), type: fc.constant(3 as const), values: fc.array(fc.nat({ max: 0xffff }), { minLength: 1, maxLength: 4 }) }),
  fc.record({ tag: fc.constantFrom(...TAGS), type: fc.constant(4 as const), values: fc.array(u32, { minLength: 1, maxLength: 4 }) }),
  fc.record({ tag: fc.constantFrom(...TAGS), type: fc.constant(5 as const), values: fc.array(fc.tuple(u32, u32), { minLength: 1, maxLength: 3 }) }),
  fc.record({ tag: fc.constantFrom(...TAGS), type: fc.constant(10 as const), values: fc.array(fc.tuple(s32, s32), { minLength: 1, maxLength: 3 }) })
)
const entries = fc.uniqueArray(entry, { selector: e => e.tag, maxLength: 8 })
/** A TIFF built from generated tags: well-formed directories whose values are anything, offsets included. */
const generatedTiff = fc
  .record({ littleEndian: fc.boolean(), magic: fc.constantFrom(42, 0x4f52, 0x5352, 0x55), ifd0: entries, exif: fc.option(entries, { nil: undefined }), subIfds: fc.option(fc.array(entries, { maxLength: 2 }), { nil: undefined }), next: fc.option(entries, { nil: undefined }) })
  .map(spec => Buffer.from(tiffBytes(spec)))

/** The bytes before the pixels: where a mutation changes what the reader does. */
const tagZone = (b: Buffer) => Math.min(b.length, 1024)

describe('PNG reader under fuzz', () => {
  it('[FUZ-002, FUZ-003, INS-003] Given random bytes behind a PNG signature or none, When the PNG reader reads them, Then it refuses them with a reason', async () => {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const bytes = fc.tuple(fc.boolean(), fc.uint8Array({ maxLength: 512 })).map(([signed, rest]) => (signed ? Buffer.concat([signature, rest]) : Buffer.from(rest)))
    await fc.assert(fc.asyncProperty(bytes, b => BINARY_CONTRACTS.readPngImage(b)), fuzzParams())
  }, FUZZ_TEST_TIMEOUT_MS)

  it('[FUZ-002, FUZ-003, INS-003] Given a valid PNG with a few bytes changed, When the PNG reader reads it, Then it returns whole planes or refuses it with a reason', async () => {
    await fc.assert(fc.asyncProperty(mutatedBytes(PNG_SEEDS), b => BINARY_CONTRACTS.readPngImage(b)), fuzzParams())
  }, FUZZ_TEST_TIMEOUT_MS)
})

describe('PNG reader on generated files', () => {
  it('[FUZ-002, FUZ-003, INS-003, NFR-019] Given a PNG assembled from a generated header and chunks, When the PNG reader reads it, Then it returns whole planes or refuses it with a reason, without unpacking more than the image', async () => {
    await fc.assert(fc.asyncProperty(generatedPng, b => BINARY_CONTRACTS.readPngImage(b)), fuzzParams())
  }, FUZZ_TEST_TIMEOUT_MS)
})

describe('TIFF and EXIF reader under fuzz', () => {
  it('[FUZ-002, FUZ-003, RIG-003] Given random bytes behind a TIFF byte order or none, When the camera RAW reader reads their tags, Then it returns tags or throws TiffReadError', async () => {
    const start = fc.constantFrom(Buffer.alloc(0), Buffer.from('II*\0'), Buffer.from('MM\0*'), Buffer.from('IIU\0'), Buffer.from('IIRO'))
    const bytes = fc.tuple(start, fc.uint8Array({ maxLength: 512 })).map(([head, rest]) => Buffer.concat([head, rest]))
    await fc.assert(fc.asyncProperty(bytes, b => BINARY_CONTRACTS.readTiffExif(b)), fuzzParams())
  }, FUZZ_TEST_TIMEOUT_MS)

  it('[FUZ-002, FUZ-003, FUZ-004, RIG-003] Given a valid camera RAW file with a few bytes changed, When its tags are read, Then it returns well-formed tags or throws TiffReadError', async () => {
    await fc.assert(fc.asyncProperty(mutatedBytes(TIFF_SEEDS, tagZone), b => BINARY_CONTRACTS.readTiffExif(b)), fuzzParams())
  }, FUZZ_TEST_TIMEOUT_MS)

  it('[FUZ-002, FUZ-003, FUZ-004, RIG-003] Given a TIFF whose tags hold any values, offsets and fractions included, When its tags are read, Then it returns well-formed tags or throws TiffReadError', async () => {
    await fc.assert(fc.asyncProperty(generatedTiff, b => BINARY_CONTRACTS.readTiffExif(b)), fuzzParams())
  }, FUZZ_TEST_TIMEOUT_MS)
})
