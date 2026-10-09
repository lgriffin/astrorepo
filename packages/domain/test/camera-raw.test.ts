import { describe, expect, it } from 'vitest'
import {
  cameraRawSummary,
  frameFileKind,
  frameTypeOfFolder,
  pixelPitchUm,
  rawCaptureTime,
  rawFormatOf,
  rawHeaders,
  rawImageType,
  unreadRawReason,
  type RawExif
} from '@astro/domain'

const exif = (over: Partial<RawExif> = {}): RawExif => ({
  make: 'Canon',
  model: 'Canon EOS 6D',
  dateTimeOriginal: '2024:03:10 21:15:03',
  subSec: null,
  offsetTime: '+01:00',
  exposureSec: 120,
  iso: 800,
  width: 5568,
  height: 3708,
  temperatureC: null,
  focalMm: 135,
  pixelUm: 6.54,
  ...over
})

describe('camera RAW files', () => {
  it('[RIG-001] Given file names, When classified, Then FITS, TIFF-based RAW and unread RAW are told apart and anything else is ignored', () => {
    expect(frameFileKind('Light_001.FIT')).toBe('fits')
    expect(frameFileKind('IMG_0001.CR2')).toBe('raw')
    expect(frameFileKind('DSC_0001.nef')).toBe('raw')
    expect(frameFileKind('a.ARW')).toBe('raw')
    expect(frameFileKind('a.dng')).toBe('raw')
    expect(frameFileKind('IMG_0001.CR3')).toBe('raw-unread')
    expect(frameFileKind('DSCF0001.RAF')).toBe('raw-unread')
    expect(frameFileKind('IMG_0001.JPG')).toBeNull()
    expect(frameFileKind('notes')).toBeNull()
    expect(rawFormatOf('IMG_0001.cr2')).toBe('CR2')
    expect(rawFormatOf('Light.fits')).toBeNull()
  })

  it('[RIG-002] Given a CR3 file, When its reason is given, Then it says it was found, is not indexed and Siril still reads it', () => {
    const reason = unreadRawReason('IMG_0001.CR3')
    expect(reason).toContain('Camera RAW (CR3) found')
    expect(reason).toContain('not indexed')
    expect(reason).toContain('Siril still reads it')
  })

  it('[RIG-001] Given an EXIF time with an offset and sub-seconds, When read, Then it becomes UTC; without an offset it keeps the camera clock unmarked', () => {
    expect(rawCaptureTime({ dateTimeOriginal: '2024:03:10 21:15:03', subSec: '25', offsetTime: '+01:00' })).toEqual({ dateObs: '2024-03-10T20:15:03.250Z', zoneKnown: true })
    expect(rawCaptureTime({ dateTimeOriginal: '2024:03:10 21:15:03', subSec: null, offsetTime: '-05:30' })).toEqual({ dateObs: '2024-03-11T02:45:03.000Z', zoneKnown: true })
    expect(rawCaptureTime({ dateTimeOriginal: '2024:03:10 21:15:03', subSec: 'xx', offsetTime: null })).toEqual({ dateObs: '2024-03-10T21:15:03.000', zoneKnown: false })
    expect(rawCaptureTime({ dateTimeOriginal: '    :  :     :  :  ', subSec: null, offsetTime: null })).toBeNull()
    expect(rawCaptureTime({ dateTimeOriginal: '2024:13:10 21:15:03', subSec: null, offsetTime: null })).toBeNull()
    expect(rawCaptureTime({ dateTimeOriginal: null, subSec: null, offsetTime: null })).toBeNull()
  })

  it('[RIG-001] Given impossible EXIF dates, times or offsets, When read, Then there is no capture time; a leap day reads', () => {
    const at = (dateTimeOriginal: string, offsetTime: string | null = null) => rawCaptureTime({ dateTimeOriginal, subSec: null, offsetTime })
    expect(at('2025:02:29 21:15:03')).toBeNull()
    expect(at('2025:02:31 21:15:03')).toBeNull()
    expect(at('2025:04:31 21:15:03')).toBeNull()
    expect(at('2025:04:10 24:00:00')).toBeNull()
    expect(at('2025:04:10 21:60:00')).toBeNull()
    expect(at('2025:04:10 21:15:61')).toBeNull()
    expect(at('2025:04:10 21:15:03', '+99:99')).toBeNull()
    expect(at('2025:04:10 21:15:03', '+15:00')).toBeNull()
    expect(at('2025:04:10 21:15:03', '-05:60')).toBeNull()
    expect(at('2024:02:29 21:15:03')).toEqual({ dateObs: '2024-02-29T21:15:03.000', zoneKnown: false })
    expect(at('2024:02:29 21:15:03', '+14:00')).toEqual({ dateObs: '2024-02-29T07:15:03.000Z', zoneKnown: true })
    expect(at('2024:02:29 21:15:03', '-12:00')).toEqual({ dateObs: '2024-03-01T09:15:03.000Z', zoneKnown: true })
  })

  it('[RIG-017] Given RAW file and folder names, When typed, Then a word in the name wins, then a folder named for its frames, else none', () => {
    expect(rawImageType('DARK_300s_ISO800_0001.CR2', 'M31')).toBe('Dark')
    expect(rawImageType('M31_LIGHT_300s_0001.CR2', 'Darks')).toBe('Light')
    expect(rawImageType('flat-12.nef', null)).toBe('Flat')
    expect(rawImageType('offset_001.arw', null)).toBe('Bias')
    expect(rawImageType('IMG_0001.CR2', 'Darks')).toBe('Dark')
    expect(rawImageType('IMG_0001.CR2', 'flats_2024-03-10')).toBe('Flat')
    expect(rawImageType('IMG_0001.CR2', 'Bias frames')).toBe('Bias')
    expect(rawImageType('IMG_0001.CR2', 'Darks_ISO800')).toBe('Dark')
    expect(rawImageType('IMG_0001.CR2', 'Flats-L')).toBe('Flat')
    expect(rawImageType('IMG_0001.CR2', 'Lights')).toBe('Light')
    // Neither name says, so the folder the frame is laid out from decides ("Darks/ISO800").
    expect(rawImageType('IMG_0001.CR2', 'ISO800')).toBeNull()
    expect(rawImageType('IMG_0001.CR2', 'Dark Shark')).toBeNull()
    expect(rawImageType('IMG_0001.CR2', 'Flaming Star')).toBeNull()
    expect(rawImageType('IMG_0001.CR2', null)).toBeNull()
  })

  it('[RIG-017] Given folder names, When read for a frame type, Then only a frame-type word with qualifiers such as an ISO, a date or a filter names one', () => {
    expect(frameTypeOfFolder('Darks_ISO800')).toBe('Dark')
    expect(frameTypeOfFolder('Flats-L')).toBe('Flat')
    expect(frameTypeOfFolder('Darks')).toBe('Dark')
    expect(frameTypeOfFolder('DarkFrames')).toBe('Dark')
    expect(frameTypeOfFolder('flats_2024-03-10')).toBe('Flat')
    expect(frameTypeOfFolder('Bias frames')).toBe('Bias')
    expect(frameTypeOfFolder('Master Offsets')).toBe('Bias')
    expect(frameTypeOfFolder('Dark Shark')).toBeNull()
    expect(frameTypeOfFolder('Darks and Flats')).toBeNull()
    expect(frameTypeOfFolder('ISO800')).toBeNull()
    expect(frameTypeOfFolder(null)).toBeNull()
  })

  it('[RIG-017] Given a RAW frame of no known type, When turned into header rows, Then no IMAGETYP is written', () => {
    expect(rawHeaders(exif(), 'CR2', null).some(r => r.keyword === 'IMAGETYP')).toBe(false)
  })

  it('[RIG-001] Given a RAW frame\'s tags, When turned into header rows, Then they carry FITS names, ISO as gain and the camera once', () => {
    const rows = rawHeaders(exif({ temperatureC: 18 }), 'CR2', 'Light')
    const value = (k: string) => rows.find(r => r.keyword === k)?.value
    expect(value('RAWFMT')).toBe('CR2')
    expect(value('INSTRUME')).toBe('Canon EOS 6D')
    expect(value('IMAGETYP')).toBe('Light')
    expect(value('DATE-OBS')).toBe('2024-03-10T20:15:03.000Z')
    expect(value('EXPTIME')).toBe(120)
    expect(value('GAIN')).toBe(800)
    expect(value('ISOSPEED')).toBe(800)
    expect(value('NAXIS1')).toBe(5568)
    expect(value('NAXIS2')).toBe(3708)
    expect(value('CCD-TEMP')).toBe(18)
    expect(value('FOCALLEN')).toBe(135)
    expect(value('XPIXSZ')).toBe(6.54)
    expect(rows.find(r => r.keyword === 'DATE-OBS')?.comment).toContain('UTC')
  })

  it('[RIG-001] Given a RAW frame with few tags, When turned into rows, Then only what it records is written and an unknown zone is said', () => {
    const rows = rawHeaders(
      { ...exif(), make: 'NIKON CORPORATION', model: 'NIKON D810A', offsetTime: null, exposureSec: null, iso: null, width: null, height: null, focalMm: null, pixelUm: null },
      'NEF',
      'Dark'
    )
    expect(rows.map(r => r.keyword)).toEqual(['RAWFMT', 'INSTRUME', 'IMAGETYP', 'DATE-OBS'])
    expect(rows[1].value).toBe('NIKON CORPORATION NIKON D810A')
    expect(rows[3].comment).toContain('time zone')
    expect(rawHeaders({ ...exif(), make: null, model: null, dateTimeOriginal: null }, 'DNG', 'Flat').map(r => r.keyword)).not.toContain('INSTRUME')
  })

  it('[RIG-001] Given a focal plane resolution, When the pixel pitch is worked out, Then each unit is honoured and implausible pitches are dropped', () => {
    expect(pixelPitchUm(3888.0, 2)).toBeCloseTo(6.53, 2)
    expect(pixelPitchUm(1529.4, 3)).toBeCloseTo(6.54, 2)
    expect(pixelPitchUm(152.9, 4)).toBeCloseTo(6.54, 2)
    expect(pixelPitchUm(0.25, 5)).toBe(4)
    expect(pixelPitchUm(2, 5)).toBeNull()
    expect(pixelPitchUm(72, 2)).toBeNull()
    expect(pixelPitchUm(3888, 9)).toBeNull()
    expect(pixelPitchUm(null, 2)).toBeNull()
    expect(pixelPitchUm(3888, null)).toBeCloseTo(6.53, 2)
  })

  it('[RIG-004] Given a stack\'s light names, When summarised, Then RAW lights are counted by format with the unread ones; FITS alone gives nothing', () => {
    expect(cameraRawSummary(['IMG_1.CR2', 'IMG_2.CR2', 'IMG_3.CR3', 'Light_1.fit'])).toEqual({ count: 3, unread: 1, formats: ['CR2', 'CR3'] })
    expect(cameraRawSummary(['Light_1.fit', 'Light_2.fits'])).toBeNull()
  })
})
