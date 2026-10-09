import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { readCameraRawExif, readTiffExif, TiffReadError } from '../../src/main/raw/tiff-exif'
import { parseCameraRawFile } from '../../src/main/raw/camera-raw'
import { cameraRawNotMeasured, measureFitsFile } from '../../src/main/fits/measure-fits'
import { cr2Bytes, tiffBytes } from '../helpers/tiff'

const source = (buf: Buffer) => ({ size: buf.length, read: async (o: number, n: number) => buf.subarray(o, o + n) })

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})
const temp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-raw-'))
  dirs.push(d)
  return d
}

describe('the TIFF and EXIF reader', () => {
  it('[RIG-001] Given a CR2-like file, When its tags are read, Then camera, time, exposure, ISO, full raw size, focal length and pixel pitch come back', async () => {
    const exif = await readTiffExif(source(cr2Bytes({ temperature: [18, 1] })))
    expect(exif).toEqual({
      make: 'Canon',
      model: 'Canon EOS 6D',
      dateTimeOriginal: '2024:03:10 21:15:03',
      subSec: null,
      offsetTime: '+01:00',
      exposureSec: 120,
      iso: 800,
      width: 5568,
      height: 3708,
      temperatureC: 18,
      focalMm: 135,
      pixelUm: 25400 / 3888
    })
  })

  it('[RIG-001] Given a big-endian NEF-like file with its raw in a SubIFD and ISO in ISOSpeed, When read, Then the SubIFD\'s size wins and a negative temperature reads', async () => {
    const buf = tiffBytes({
      littleEndian: false,
      ifd0: [
        { tag: 0x0100, type: 4, values: [160] },
        { tag: 0x0101, type: 4, values: [120] },
        { tag: 0x010f, type: 2, values: 'NIKON CORPORATION' },
        { tag: 0x0110, type: 2, values: 'NIKON D810A' }
      ],
      subIfds: [
        [{ tag: 0x00fe, type: 4, values: [0] }, { tag: 0x0100, type: 4, values: [7380] }, { tag: 0x0101, type: 4, values: [4928] }],
        [{ tag: 0x0100, type: 4, values: [640] }, { tag: 0x0101, type: 4, values: [480] }]
      ],
      exif: [
        { tag: 0x829a, type: 5, values: [[1, 250]] },
        { tag: 0x8833, type: 4, values: [1600] },
        { tag: 0x9003, type: 2, values: '2025:08:01 23:59:58' },
        { tag: 0x9291, type: 2, values: '50' },
        { tag: 0x9400, type: 10, values: [[-35, 10]] }
      ]
    })
    const exif = await readTiffExif(source(buf))
    expect(exif).toMatchObject({ make: 'NIKON CORPORATION', model: 'NIKON D810A', width: 7380, height: 4928, iso: 1600, exposureSec: 0.004, subSec: '50', temperatureC: -3.5, offsetTime: null, pixelUm: null, focalMm: null })
  })

  it('[RIG-001] Given an RW2 or ORF header, When read, Then it is taken as TIFF', async () => {
    for (const magic of [0x55, 0x4f52]) {
      const exif = await readTiffExif(source(tiffBytes({ magic, ifd0: [{ tag: 0x010f, type: 2, values: 'Panasonic' }] })))
      expect(exif.make).toBe('Panasonic')
    }
  })

  it('[RIG-003] Given a file that is not TIFF, or whose tags point past its end, When read, Then it is refused with a reason', async () => {
    await expect(readTiffExif(source(Buffer.from('ftypcrx not tiff at all')))).rejects.toThrow('does not start with a TIFF header')
    await expect(readTiffExif(source(Buffer.from('II')))).rejects.toThrow('too short')
    const bad = Buffer.from(tiffBytes({ ifd0: [{ tag: 0x010f, type: 2, values: 'Canon' }] }))
    bad.writeUInt16LE(7, 2)
    await expect(readTiffExif(source(bad))).rejects.toThrow('not one the app knows')
    const cut = cr2Bytes().subarray(0, 40)
    await expect(readTiffExif(source(cut))).rejects.toThrow(TiffReadError)
    await expect(readTiffExif(source(cut))).rejects.toThrow('past its end')
  })

  it('[RIG-001] Given a CR2 on disk, When read, Then only its tags are read from the file', async () => {
    const dir = temp()
    const file = path.join(dir, 'IMG_0001.CR2')
    fs.writeFileSync(file, cr2Bytes())
    expect((await readCameraRawExif(file)).model).toBe('Canon EOS 6D')
  })
})

describe('camera RAW as the scanner reads it', () => {
  it('[RIG-001] [RIG-017] Given a CR2 in a Darks folder, When parsed, Then it becomes FITS-named header rows with ISO as gain and the type from the folder', async () => {
    const dir = path.join(temp(), 'Darks')
    fs.mkdirSync(dir)
    fs.writeFileSync(path.join(dir, 'IMG_0100.CR2'), cr2Bytes())
    const result = await parseCameraRawFile(path.join(dir, 'IMG_0100.CR2'))
    expect(result.isValid).toBe(true)
    const v = (k: string) => result.headerMap.get(k)?.value
    expect([v('IMAGETYP'), v('GAIN'), v('EXPTIME'), v('NAXIS1'), v('DATE-OBS'), v('RAWFMT'), v('INSTRUME')]).toEqual(['Dark', 800, 120, 5568, '2024-03-10T20:15:03.000Z', 'CR2', 'Canon EOS 6D'])
    expect(result.headers[0].raw).toBe("RAWFMT  = 'CR2' / Camera RAW format")
  })

  it('[RIG-002] Given a CR3, When parsed, Then it is listed as found and not read, without being opened', async () => {
    const result = await parseCameraRawFile(path.join(temp(), 'missing', 'IMG_0001.CR3'))
    expect(result.isValid).toBe(false)
    expect(result.error).toContain('Camera RAW (CR3) found; its metadata is not read')
  })

  it('[RIG-003] Given a damaged NEF or one that vanished, When parsed, Then it is unreadable with the reason', async () => {
    const dir = temp()
    fs.writeFileSync(path.join(dir, 'DSC_0001.NEF'), 'garbage, not a camera file')
    expect((await parseCameraRawFile(path.join(dir, 'DSC_0001.NEF'))).error).toBe('Camera RAW (NEF) could not be read: Not a TIFF-based camera RAW file: it does not start with a TIFF header.')
    expect((await parseCameraRawFile(path.join(dir, 'gone.NEF'))).error).toContain('Camera RAW (NEF) could not be read: ENOENT')
  })

  it('[RIG-005] Given a camera RAW light, When it is measured for grading, Then it says its pixels are not measured and that it stays in the stack', async () => {
    await expect(measureFitsFile('/data/IMG_0001.CR2')).rejects.toThrow(cameraRawNotMeasured('/data/IMG_0001.CR2'))
    expect(cameraRawNotMeasured('/data/IMG_0001.cr3')).toBe('Camera RAW (CR3) pixels are not measured, so this light is not graded and stays in the stack.')
  })
})
