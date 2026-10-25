import { describe, it } from 'vitest'
import fc from 'fast-check'
import {
  DEFAULT_GRADE_LIMITS,
  DEFAULT_JOB_SETTINGS,
  GRADE_LIMIT_KEYS,
  JOB_SETTING_KEYS,
  isScopeHost,
  parseGradeLimits,
  parseVesperaSettings,
  parseJobSettings,
  rawCaptureTime
} from '@astro/domain'
import { TEXT_CONTRACTS, ensure } from './contracts'
import { FUZZ_TEST_TIMEOUT_MS, fuzzParams, mutatedText, textish, withinBudget } from './fuzz-config'

/** Valid inputs each text parser is fuzzed from, and fragments its format is made of. */
const SEEDS: Record<keyof typeof TEXT_CONTRACTS, { seeds: string[]; pieces: string[] }> = {
  parseMpcComet: {
    seeds: [
      '0001P         1986 02  9.4589  0.574761  0.967482  111.8566   59.0994  162.2516  19860205   4.0  6.0  1P/Halley                                                 98, 1083',
      'CK99Z999  2099 12 31.5  1.5  1.0  10  20  30  C/2099 Z999 (Test)',
      '0001P  1986 02 09.4589  0.574761  0.967482  111.8566  59.0994  162.2516'
    ],
    pieces: [' ', '  ', '.', '-', '+', '0', '9', '99999999', '1e9', '2024', '13', '31.999', ' 0 ', '360', '181', 'NaN', 'Infinity']
  },
  parseRa: {
    seeds: ['05h35m17.3s', '05:35:17.3', '05 35 17', '5.588h', '83.82', '83.82°', '0', '359.999'],
    pieces: ['h', 'm', 's', ':', ' ', '.', '-', '+', '°', '24', '60', '360', '1e9', 'NaN', '٣']
  },
  parseDec: {
    seeds: ['+41:16:09', "-05°23'28\"", '41 16 9', '-5.39', '90', '-0 30 00', '+00:00:00'],
    pieces: ['°', "'", '"', ':', ' ', '.', '-', '+', '90', '91', '60', 'd', 'm', 's', '1e9', '-0']
  },
  parseToolVersion: {
    seeds: ['siril 1.4.0-beta2\n', 'GNU bash, version 5.2.37(1)-release (x86_64-pc-msys)', 'syqon-cli v2.3.1\nCopyright SyQon', 'ASTAP version 2024.03.11'],
    pieces: ['.', '-', '+', 'v', '1', '.0', '\n', '\r\n', 'beta', '..']
  },
  astapCatalogues: {
    seeds: ['d50_0101.1476\nd50_0102.1476\nh18_1234.290', 'C:\\astap\\h17_0101.290\n/opt/astap/g05_0101.290\nreadme.txt'],
    pieces: ['_', '.290', '.1476', '\\', '/', 'D50', 'z99', '\n']
  },
  parseAstapResult: {
    seeds: [
      [
        'PLTSOLVD=T', 'CRPIX1= 5.4050000000000000E+002', 'CRPIX2= 9.6050000000000000E+002', 'CRVAL1= 1.0684708333333334E+001',
        'CRVAL2= 4.1268750000000000E+001', 'CDELT1=-6.6388888888888886E-004', 'CDELT2= 6.6388888888888886E-004', 'CROTA1= 1.0000000000000000E+001',
        'CROTA2= 1.0000000000000000E+001', 'CD1_1=-6.5380300000000000E-004', 'CD1_2=-1.1528400000000000E-004', 'CD2_1=-1.1528400000000000E-004',
        'CD2_2= 6.5380300000000000E-004'
      ].join('\r\n'),
      'PLTSOLVD=T\nCRVAL1=10\nCRVAL2=20\nCDELT1=0.001\nCDELT2=0.001\nCROTA2=30',
      'PLTSOLVD=F\nERROR=No star database found!',
      'PLTSOLVD=F\nWARNING=Not enough stars'
    ],
    pieces: ['=', '\n', 'E+300', 'E-300', '1e308', '-1e308', "'", '0', '-0', '90.0001', 'NaN', 'Infinity', 'CRPIX1=', 'CD1_1=', 'CD2_2=', 'CRVAL2=']
  },
  parseSirilSolve: {
    seeds: [
      'log: Plate solving succeeded\nlog: Resolution:      2.390 arcsec/px\nlog: Rotation:        -12.34 deg\nlog: Image center: alpha: 00h42m44s, delta: +41°16\'08"\n',
      'Resolution: 1.200 arcsec/px\nRotation: +12.34 deg (flipped)\nImage center: alpha: 05 35 17.300, delta: -05 23 28.000\n',
      'log: Plate solving failed: not enough stars\n',
      'log: Could not load catalogue\n'
    ],
    pieces: ['.', '..', ' ', 'h', 'm', 's', '°', "'", '"', '-', '+', '99', '0', 'arcsec', 'deg', ',', '\n', 'log: ', '9999999999999999999999']
  },
  parseSyqonModels: {
    seeds: [
      ['id  status  description', 'axiom-mini       available    Star separation', 'parallax-nano    Available    Sharpening', 'prism-essential | locked | Denoise', '  - deep-gradient: included', 'nova-x\tunavailable\tNoise reduction pro'].join('\r\n'),
      'constructor available\ntoString yes'
    ],
    pieces: ['|', ',', ':', '\t', '-', '*', '•', '#', 'available', 'locked', 'constructor', 'hasOwnProperty', '__proto__', 'valueOf', '\n']
  },
  parseLiveProgress: {
    seeds: ['Loading model\nProcessing tiles  42%\n', '\r 10.5 %\r 63.5 %', 'tile 3/9 done'],
    pieces: ['%', ' %', '\r', '\n', '999', '.', '100', '-5']
  },
  splitSirilScript: {
    seeds: [
      'requires 1.2.0\n# a comment\ncd biases\nconvert bias -out=../process\ncd ../process\nstack bias rej 3 3 -nonorm -out=../masters/bias_stacked\ncd ..\ncd lights\nconvert light -out=../process\ncd ../process\ncalibrate light -debayer\nregister pp_light\nstack r_pp_light rej 3 3 -norm=addscale -out=result\nload result\nsave ../result\ncd ..\nclose\n',
      'setext fit\ncd "lights"\nconvert light\n'
    ],
    pieces: ['cd ', '..', '/', '\\', 'C:', '~', '"', '#', '\n', 'stack ', 'convert ', 'close', 'set16bits', 'requires 1.2.0']
  },
  explainSirilFailure: {
    seeds: ['log: Stacking...\nlog: Not enough stars to register\n', 'log: Error opening file: Permission denied\n', 'log: sequence pp_light not found\n'],
    pieces: ['\n', 'stars', 'error', 'sequence ', ' empty', 'Permission denied', 'not a cfa']
  },
  parseStackManifest: {
    seeds: [
      JSON.stringify({
        format: 'astrorepo-stack-manifest', version: 1, result: { file: 'result.fit', sizeBytes: 10 }, target: { id: 't', name: 'M 42' },
        job: { id: 'j', title: 'Stack', startedAt: null, finishedAt: '2026-03-01T00:00:00.000Z' }, siril: { program: 'siril-cli', script: 'OSC' },
        steps: [], frames: { lights: [{ name: 'a.fit', source: '/src/a.fit' }], darks: [], flats: [], biases: [{ name: 'b.fit', source: null }] }, rejected: []
      })
    ],
    pieces: ['{', '}', '[', ']', 'null', '"', ',', ':', '1', '"name"', '"source"', '"__proto__"', 'true']
  },
  parseClock: {
    seeds: ['02:00', ' 23:59 ', '0:00', '7:05'],
    pieces: [':', '0', '9', '24', '60', ' ', '\n', '-', '+', '٣']
  },
  frameFileKind: {
    seeds: ['M42_Light_001.fit', 'IMG_0001.CR2', 'DSCF0001.RAF', 'notes.txt', '.fits'],
    pieces: ['.', '.fit', '.FITS', '.cr3', '.nef', '/', '\\', '']
  },
  bayerChannels: {
    seeds: ['RGGB', ' bggr ', 'GRBG', 'GBRG'],
    pieces: ['R', 'G', 'B', 'g', ' ', 'X']
  },
  filterFamily: {
    seeds: ['Ha 7nm', 'OIII (3nm)', 'L', 'L-eXtreme', 'S II', 'Lum 6.5 nm'],
    pieces: ['nm', ' ', '(', ')', '-', '_', '7', '.', 'Ha', 'O', 'III']
  },
  readFtpReplies: {
    seeds: ['220-Welcome to the Vespera\r\n220-second line\r\n220 Ready\r\n331 Password please\r\n', '211-Features:\n MLSD\n EPSV\n211 End\n150 Here\r\n226 Done\r\n', '230 Signed in\r\n229 (|||50123|)\r\n'],
    pieces: ['\r\n', '\n', '-', ' ', '220', '999', '000', '211-', '211 ']
  },
  parseMlsdListing: {
    seeds: [
      'type=cdir; .\r\ntype=pdir; ..\r\ntype=dir;modify=20240310213302; 01-images-initial\r\ntype=file;size=4194304;modify=20240310213302; img-0001.fits\r\n',
      'Type=File;Size=12; observation.json\ntype=OS.unix=slink:/x; link\n'
    ],
    pieces: [';', '=', ' ', 'size=', 'type=', 'dir', 'file', '-1', '99999999999999999999', '/', '..', '\r\n']
  },
  parseListListing: {
    seeds: [
      'total 2\r\ndrwxr-xr-x    2 0        0             4096 Mar 10 21:33 expert mode\r\n-rw-r--r--    1 0        0          4194304 Mar 10  2024 img-0001.fits\r\nlrwxrwxrwx 1 0 0 4 Mar 10 21:33 l -> x\r\n',
      '03-10-24  09:33PM       <DIR>          user\r\n03-10-2024  21:33              4194304 img-0001.fits\r\n'
    ],
    pieces: [' ', '  ', 'd', '-', 'l', 'rwx', '<DIR>', 'PM', ':', '99999999999999999999', '/', '\\', '..', '\r\n']
  },
  parsePassive: {
    seeds: ['227 Entering Passive Mode (10,0,0,1,195,80).', '229 Entering Extended Passive Mode (|||50123|)', '(192, 168, 1, 2, 0, 21)'],
    pieces: [',', '(', ')', '|', '!', '255', '256', '0', '999999', ' ']
  }
}

describe('text parsers under fuzz', () => {
  for (const [target, check] of Object.entries(TEXT_CONTRACTS)) {
    const { seeds, pieces } = SEEDS[target]
    it(`[FUZ-001, FUZ-003, FUZ-004] Given random text, When ${target} reads it, Then it returns its documented result or failure, in time and well formed`, () => {
      fc.assert(fc.property(textish(), input => check(input)), fuzzParams())
    }, FUZZ_TEST_TIMEOUT_MS)

    it(`[FUZ-001, FUZ-003, FUZ-004] Given a valid ${target} input with a few spans changed, When it is read, Then it returns its documented result or failure, in time and well formed`, () => {
      fc.assert(fc.property(mutatedText(seeds, pieces), input => check(input)), fuzzParams())
    }, FUZZ_TEST_TIMEOUT_MS)
  }
})

describe('settings and EXIF text under fuzz', () => {
  const anyText = fc.option(fc.oneof(textish(24), fc.double().map(String), fc.integer().map(String)), { nil: null })

  it('[FUZ-001, FUZ-004, JOB-012] Given anything saved under the job settings keys, When parseJobSettings reads them, Then every setting is in range or its default', () => {
    fc.assert(
      fc.property(fc.dictionary(fc.constantFrom(...Object.values(JOB_SETTING_KEYS)), anyText.map(v => v ?? '')), saved => {
        const s = withinBudget('parseJobSettings', () => parseJobSettings(key => saved[key] ?? null))
        ensure(Number.isInteger(s.windowStart) && s.windowStart >= 0 && s.windowStart < 1440, 'window start in the day')
        ensure(Number.isInteger(s.windowEnd) && s.windowEnd >= 0 && s.windowEnd < 1440, 'window end in the day')
        ensure(s.idleMinutes >= 0 && s.idleMinutes <= 240, 'idle minutes in range')
        ensure(s.maxCpuPercent >= 1 && s.maxCpuPercent <= 100, 'CPU limit in range')
        if (!(JOB_SETTING_KEYS.idleMinutes in saved)) ensure(s.idleMinutes === DEFAULT_JOB_SETTINGS.idleMinutes, 'a missing setting is its default')
      }),
      fuzzParams()
    )
  }, FUZZ_TEST_TIMEOUT_MS)

  it('[FUZ-001, FUZ-004, GRD-010] Given anything saved under the grading keys, When parseGradeLimits reads them, Then every limit is in range or its default', () => {
    fc.assert(
      fc.property(fc.dictionary(fc.constantFrom(...Object.values(GRADE_LIMIT_KEYS)), anyText.map(v => v ?? '')), saved => {
        const l = withinBudget('parseGradeLimits', () => parseGradeLimits(key => saved[key] ?? null))
        ensure(l.maxEccentricity >= 0.05 && l.maxEccentricity <= 1, 'eccentricity limit in range')
        ensure(l.maxFwhmRatio >= 1 && l.maxFwhmRatio <= 10, 'FWHM ratio in range')
        ensure(l.minStarRatio >= 0 && l.minStarRatio <= 1, 'star ratio in range')
        ensure(l.maxBackgroundRatio >= 1 && l.maxBackgroundRatio <= 100, 'background ratio in range')
        ensure(l.maxFwhmPixels === null || (l.maxFwhmPixels >= 0.5 && l.maxFwhmPixels <= 100), 'fixed FWHM in range or none')
        if (!(GRADE_LIMIT_KEYS.maxEccentricity in saved)) ensure(l.maxEccentricity === DEFAULT_GRADE_LIMITS.maxEccentricity, 'a missing limit is its default')
      }),
      fuzzParams()
    )
  }, FUZZ_TEST_TIMEOUT_MS)

  it('[FUZ-001, FUZ-004, VSP-014] Given anything saved under the Vespera keys, When parseVesperaSettings reads them, Then the address, port and kinds are usable or their defaults', () => {
    const keys = fc.constantFrom('vespera_host', 'vespera_landing', 'vespera_formats')
    fc.assert(
      fc.property(fc.dictionary(keys, fc.oneof(anyText, mutatedText(['10.0.0.1', '10.0.0.1:2121', 'vespera.local', 'fits,tiff,json'], [':', '.', ',', '0', '255', '256', '65536']))), fc.option(fc.constant('/home/raw'), { nil: null }), (saved, homeRaw) => {
        const s = withinBudget('parseVesperaSettings', () => parseVesperaSettings(saved, homeRaw))
        ensure(isScopeHost(s.host), `a host: ${s.host}`)
        ensure(Number.isInteger(s.port) && s.port >= 1 && s.port <= 65535, `a port: ${s.port}`)
        ensure(s.formats.length > 0 && s.formats.some(f => f !== 'json') && new Set(s.formats).size === s.formats.length, `kinds of file: ${s.formats.join(',')}`)
        ensure(s.landingRoot === null || s.landingRoot.length > 0, 'a landing folder or none')
      }),
      fuzzParams()
    )
  }, FUZZ_TEST_TIMEOUT_MS)

  it('[FUZ-001, FUZ-004, RIG-001] Given any date, sub-second and offset text from EXIF, When rawCaptureTime reads them, Then it gives a real ISO time or null', () => {
    const date = fc.oneof(
      textish(30),
      mutatedText(['2024:03:10 21:15:03', '2024:02:29 00:00:00', '1900:01:01T00:00:00'], [':', ' ', 'T', '0', '9', '99', '13', '32'])
    )
    const offset = fc.option(fc.oneof(textish(8), mutatedText(['+01:00', '-0530', '+14:00', '-12:00'], ['+', '-', ':', '0', '9'])), { nil: null })
    const subSec = fc.option(fc.oneof(textish(8), fc.stringMatching(/^\d{1,30}$/)), { nil: null })
    fc.assert(
      fc.property(date, subSec, offset, (dateTimeOriginal, sub, offsetTime) => {
        const out = withinBudget('rawCaptureTime', () => rawCaptureTime({ dateTimeOriginal, subSec: sub, offsetTime }))
        if (out === null) return
        const at = new Date(out.zoneKnown ? out.dateObs : `${out.dateObs}Z`)
        ensure(Number.isFinite(at.getTime()), `a real time: ${out.dateObs}`)
        ensure(out.zoneKnown === out.dateObs.endsWith('Z'), 'UTC is marked only when the zone is known')
      }),
      fuzzParams()
    )
  }, FUZZ_TEST_TIMEOUT_MS)
})
