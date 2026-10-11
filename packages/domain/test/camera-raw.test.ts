import { describe, expect, it } from 'vitest'
import {
  cameraRawSummary,
  daysInMonth,
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

describe('camera RAW edge cases', () => {
  it('[RIG-001] Given names with a dot first, odd case or no extension, When classified, Then only the extension decides', () => {
    expect(frameFileKind('.CR2')).toBe('raw')
    expect(frameFileKind('.fits')).toBe('fits')
    expect(frameFileKind('IMG.0001.Nef')).toBe('raw')
    expect(frameFileKind('cr2')).toBeNull()
    expect(frameFileKind('')).toBeNull()
    expect(rawFormatOf('IMG_0001.raf')).toBe('RAF')
    expect(rawFormatOf('notes.txt')).toBeNull()
  })

  it('[RIG-002] Given an unread RAW file or a name of no format, When its reason is given, Then the whole sentence names the format or RAW', () => {
    expect(unreadRawReason('DSCF0001.raf')).toBe('Camera RAW (RAF) found; its metadata is not read, so it is not indexed. Siril still reads it when it stacks the folder. Convert it to DNG to have it indexed.')
    expect(unreadRawReason('notes')).toContain('Camera RAW (RAW) found')
  })

  it('[RIG-001] Given EXIF times at the edges of the calendar and the clock, When read, Then each limit is honoured exactly', () => {
    const at = (dateTimeOriginal: string | null) => rawCaptureTime({ dateTimeOriginal, subSec: null, offsetTime: null })
    expect(at('1900:01:01 00:00:00')).toEqual({ dateObs: '1900-01-01T00:00:00.000', zoneKnown: false })
    expect(at('1899:12:31 23:59:59')).toBeNull()
    expect(at('2024:00:10 21:15:03')).toBeNull()
    expect(at('2024:12:31 23:59:59')).toEqual({ dateObs: '2024-12-31T23:59:59.000', zoneKnown: false })
    expect(at('2024:01:00 21:15:03')).toBeNull()
    expect(at('2024:01:31 21:15:03')).toEqual({ dateObs: '2024-01-31T21:15:03.000', zoneKnown: false })
    expect(at('2024-03-10 21:15:03')).toBeNull()
    expect(at('2024:03:10T21:15:03')).toEqual({ dateObs: '2024-03-10T21:15:03.000', zoneKnown: false })
    expect(at('  2024:03:10 21:15:03  ')).toEqual({ dateObs: '2024-03-10T21:15:03.000', zoneKnown: false })
    expect(at('x2024:03:10 21:15:03')).toBeNull()
    expect(at('2024:03:10 21:15')).toBeNull()
    expect(at('2024:3:10 21:15:03')).toBeNull()
    expect(at('2024:03:10 2:15:03')).toBeNull()
  })

  it('[RIG-001] Given sub-seconds and offsets in every written form, When read, Then milliseconds are capped and the offset is applied with its sign', () => {
    const at = (subSec: string | null, offsetTime: string | null) => rawCaptureTime({ dateTimeOriginal: '2024:03:10 21:15:03', subSec, offsetTime })
    expect(at('9999', null)?.dateObs).toBe('2024-03-10T21:15:03.999')
    expect(at(' 5 ', null)?.dateObs).toBe('2024-03-10T21:15:03.500')
    expect(at('5x', null)?.dateObs).toBe('2024-03-10T21:15:03.000')
    expect(at('x5', null)?.dateObs).toBe('2024-03-10T21:15:03.000')
    expect(at('', null)?.dateObs).toBe('2024-03-10T21:15:03.000')
    expect(at(null, '+0130')).toEqual({ dateObs: '2024-03-10T19:45:03.000Z', zoneKnown: true })
    expect(at(null, ' -0130 ')).toEqual({ dateObs: '2024-03-10T22:45:03.000Z', zoneKnown: true })
    expect(at(null, '+00:45')?.dateObs).toBe('2024-03-10T20:30:03.000Z')
    expect(at(null, '+14:01')).toBeNull()
    expect(at(null, '+13:59')?.dateObs).toBe('2024-03-10T07:16:03.000Z')
    expect(at(null, '-14:00')?.dateObs).toBe('2024-03-11T11:15:03.000Z')
    expect(at(null, '+05:59')?.dateObs).toBe('2024-03-10T15:16:03.000Z')
    expect(at(null, '01:00')).toEqual({ dateObs: '2024-03-10T21:15:03.000', zoneKnown: false })
    expect(at(null, '+1:00')).toEqual({ dateObs: '2024-03-10T21:15:03.000', zoneKnown: false })
    expect(at(null, '+01:00x')).toEqual({ dateObs: '2024-03-10T21:15:03.000', zoneKnown: false })
    expect(at(null, 'x+01:00')).toEqual({ dateObs: '2024-03-10T21:15:03.000', zoneKnown: false })
  })

  it('[RIG-001] Given months of the Gregorian calendar, When their days are counted, Then leap years and month lengths are right', () => {
    expect(daysInMonth(2024, 2)).toBe(29)
    expect(daysInMonth(2023, 2)).toBe(28)
    expect(daysInMonth(1900, 2)).toBe(28)
    expect(daysInMonth(2000, 2)).toBe(29)
    expect(daysInMonth(2024, 4)).toBe(30)
    expect(daysInMonth(2024, 12)).toBe(31)
  })

  it('[RIG-017] Given frame-type words inside other words or in plural forms, When a file name is typed, Then only a whole word counts', () => {
    expect(rawImageType('darkness_0001.CR2', null)).toBeNull()
    expect(rawImageType('Flatiron_0001.CR2', null)).toBeNull()
    expect(rawImageType('Biases_0001.CR2', null)).toBe('Bias')
    expect(rawImageType('M31Lights_0001.CR2', null)).toBe('Light')
    expect(rawImageType('NGCLights_0001.CR2', null)).toBeNull()
    expect(rawImageType('M31_Lights_0001.CR2', null)).toBe('Light')
    expect(rawImageType('2024_flats1.CR2', null)).toBe('Flat')
    expect(rawImageType('Offset.ARW', null)).toBe('Bias')
  })

  it('[RIG-017] Given folders named for their frames with each kind of qualifier, When read, Then the qualifier is allowed and any other word is not', () => {
    for (const q of ['frames', 'frame', 'master', 'masters', 'calib', 'calibration', 'raw', 'iso', 'gain', 'l', 'r', 'g', 'b', 'lum', 'luminance', 'red', 'green', 'blue', 'clear', 'ha', 'halpha', 'oiii', 'o3', 'sii', 's2', 'nii', 'n2', 'hb', 'hbeta', 'uv', 'ir', 'uvir', 'ircut', 'lp', 'ISO1600', '300s', 'x2']) {
      expect(frameTypeOfFolder(`Darks ${q}`)).toBe('Dark')
    }
    for (const w of ['Shark', 'frameset', 'masterpiece', 'xha', 'has', 'lps', 'clears', 'oiiix', 'ab']) {
      expect(frameTypeOfFolder(`Darks ${w}`)).toBeNull()
    }
    expect(frameTypeOfFolder('Lights.2024')).toBe('Light')
    expect(frameTypeOfFolder('  Flats  ')).toBe('Flat')
    expect(frameTypeOfFolder('Darkframe')).toBe('Dark')
    expect(frameTypeOfFolder('Biases')).toBe('Bias')
    expect(frameTypeOfFolder('xDarks')).toBeNull()
    expect(frameTypeOfFolder('Darksx')).toBeNull()
    expect(frameTypeOfFolder('')).toBeNull()
    expect(frameTypeOfFolder(undefined)).toBeNull()
  })

  it('[RIG-001] Given a RAW frame\'s full tags, When turned into rows, Then every row carries its exact keyword, value and comment', () => {
    expect(rawHeaders(exif({ temperatureC: -2.5, pixelUm: 6.5449 }), 'CR2', 'Light')).toEqual([
      { keyword: 'RAWFMT', value: 'CR2', comment: 'Camera RAW format' },
      { keyword: 'INSTRUME', value: 'Canon EOS 6D', comment: 'Camera make and model (EXIF)' },
      { keyword: 'IMAGETYP', value: 'Light', comment: 'From the file or folder name' },
      { keyword: 'DATE-OBS', value: '2024-03-10T20:15:03.000Z', comment: 'UTC, from the EXIF time and its offset' },
      { keyword: 'EXPTIME', value: 120, comment: 'ExposureTime (EXIF), seconds' },
      { keyword: 'GAIN', value: 800, comment: 'ISO, used as gain' },
      { keyword: 'ISOSPEED', value: 800, comment: 'ISO (EXIF)' },
      { keyword: 'NAXIS1', value: 5568, comment: 'Image width (TIFF)' },
      { keyword: 'NAXIS2', value: 3708, comment: 'Image height (TIFF)' },
      { keyword: 'CCD-TEMP', value: -2.5, comment: 'Temperature (EXIF), °C' },
      { keyword: 'FOCALLEN', value: 135, comment: 'FocalLength (EXIF), mm' },
      { keyword: 'XPIXSZ', value: 6.54, comment: 'From FocalPlaneXResolution, µm' }
    ])
  })

  it('[RIG-001] Given zero or missing tags, a model alone or a model not starting with the make, When turned into rows, Then zeros are not written and the camera is named once', () => {
    const rows = rawHeaders(exif({ make: '  ', model: ' EOS Ra ', offsetTime: null, exposureSec: 0, iso: 0, width: 0, height: 0, temperatureC: 0, focalMm: 0, pixelUm: 0 }), 'CR2', null)
    expect(rows).toEqual([
      { keyword: 'RAWFMT', value: 'CR2', comment: 'Camera RAW format' },
      { keyword: 'INSTRUME', value: 'EOS Ra', comment: 'Camera make and model (EXIF)' },
      { keyword: 'DATE-OBS', value: '2024-03-10T21:15:03.000', comment: 'Camera clock; the EXIF does not record its time zone' },
      { keyword: 'CCD-TEMP', value: 0, comment: 'Temperature (EXIF), °C' }
    ])
    expect(rawHeaders(exif({ make: 'SONY', model: 'ILCE-7M3' }), 'ARW', null)[1].value).toBe('SONY ILCE-7M3')
    expect(rawHeaders(exif({ make: 'canon', model: 'Canon EOS 6D' }), 'CR2', null)[1].value).toBe('Canon EOS 6D')
    expect(rawHeaders(exif({ make: 'Canon', model: 'canon eos 6d' }), 'CR2', null)[1].value).toBe('canon eos 6d')
    expect(rawHeaders(exif({ make: 'Canon', model: null }), 'CR2', null)[1].value).toBe('Canon')
    expect(rawHeaders(exif({ make: 'EOS 6D Canon', model: 'EOS' }), 'CR2', null)[1].value).toBe('EOS 6D Canon EOS')
    expect(rawHeaders(exif({ exposureSec: 0.5, iso: 1, width: 1, height: 1, focalMm: 0.1, pixelUm: 0.01 }), 'CR2', null).map(r => r.keyword)).toEqual(['RAWFMT', 'INSTRUME', 'DATE-OBS', 'EXPTIME', 'GAIN', 'ISOSPEED', 'NAXIS1', 'NAXIS2', 'FOCALLEN', 'XPIXSZ'])
    expect(rawHeaders(exif({ exposureSec: -1, iso: -1, width: -1, height: -1, focalMm: -1, pixelUm: -1 }), 'CR2', null).map(r => r.keyword)).toEqual(['RAWFMT', 'INSTRUME', 'DATE-OBS'])
  })

  it('[RIG-001] Given pitches at the plausible limits and each unit, When worked out, Then 1 and 30 µm are kept and just beyond is dropped', () => {
    expect(pixelPitchUm(1, 5)).toBe(1)
    expect(pixelPitchUm(0.04, 5)).toBe(25)
    expect(pixelPitchUm(1 / 30, 5)).toBeCloseTo(30, 9)
    expect(pixelPitchUm(1.001, 5)).toBeNull()
    expect(pixelPitchUm(1 / 30.01, 5)).toBeNull()
    expect(pixelPitchUm(1000, 4)).toBe(1)
    expect(pixelPitchUm(25_400, 2)).toBe(1)
    expect(pixelPitchUm(10_000, 3)).toBe(1)
    expect(pixelPitchUm(0, 2)).toBeNull()
    expect(pixelPitchUm(-5, 2)).toBeNull()
    expect(pixelPitchUm(Number.NaN, 2)).toBeNull()
    expect(pixelPitchUm(1, 1)).toBeNull()
  })

  it('[RIG-004] Given RAW lights in several formats out of order, When summarised, Then formats are sorted and unread ones counted', () => {
    expect(cameraRawSummary(['b.NEF', 'a.RAF', 'c.CR2', 'd.raf', 'e.jpg'])).toEqual({ count: 4, unread: 2, formats: ['CR2', 'NEF', 'RAF'] })
    expect(cameraRawSummary([])).toBeNull()
  })
})
