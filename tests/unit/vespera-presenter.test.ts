import { describe, expect, it } from 'vitest'
import type { CopyProgress, VesperaSurvey } from '@astro/application'
import { copyPace, parseVesperaSettings, type ObservationStatus } from '@astro/domain'
import {
  formatTakenAt, indexingText, toObservationView, toVesperaProgressView, toVesperaSettingsView, toVesperaSurveyView, vesperaAddress
} from '../../src/main/adapters/vespera-presenter'
import { schemas } from '../../src/main/ipc/schemas'

const MB = 1024 ** 2

const status = (over: Partial<ObservationStatus> = {}): ObservationStatus => ({
  kind: 'observation',
  folder: '2024-03-10_21-33-02_M 42',
  takenAt: '2024-03-10T21:33:02',
  target: 'M 42',
  files: 213,
  bytes: 890 * MB,
  copiedFiles: 0,
  newFiles: 213,
  newBytes: 890 * MB,
  differentFiles: 0,
  counts: { fits: 212, tiff: 1, jpeg: 1, json: 1 },
  landsIn: 'M 42',
  state: 'new',
  ...over
})

const progress = (over: Partial<CopyProgress> = {}): CopyProgress => ({
  state: 'copying',
  startedAt: new Date('2026-10-14T21:00:00Z'),
  finishedAt: null,
  landingRoot: 'D:\\Astro\\raw',
  targets: ['M 42'],
  totalFiles: 412,
  doneFiles: 119,
  skippedFiles: 3,
  totalBytes: 1600 * MB,
  doneBytes: 300 * MB,
  current: 'M 42/obs/01-images-initial/img-0120.fits',
  pace: copyPace(300 * MB, 1600 * MB, 75_000),
  error: null,
  shortBytes: null,
  ...over
})

describe('Vespera presenter', () => {
  it('[VSP-001] Given an observation, When shown, Then its title, date, contents and state read as sentences', () => {
    expect(toObservationView(status())).toEqual({
      kind: 'observation', folder: '2024-03-10_21-33-02_M 42', title: 'M 42', takenAt: '10 Mar 2024, 21:33', suggestedTarget: 'M 42',
      contents: '212 FITS, 1 TIFF, 1 JPEG', state: 'new', stateLine: '213 files to copy, 890.0 MB', warning: null
    })
    expect(toObservationView(status({ state: 'partly', copiedFiles: 100, newFiles: 113, newBytes: 400 * MB })).stateLine).toBe('113 of 213 files still to copy, 400.0 MB')
    expect(toObservationView(status({ state: 'copied', copiedFiles: 213, newFiles: 0 })).stateLine).toBe('All 213 files are on the PC')
    expect(toObservationView(status({ state: 'empty', files: 0, counts: { fits: 0, tiff: 0, jpeg: 0, json: 0 } }))).toMatchObject({ stateLine: 'Nothing of the kinds you copy', contents: 'No images' })
    expect(toObservationView(status({ target: null, takenAt: null, folder: 'obs' }))).toMatchObject({ title: 'obs', takenAt: null })
  })

  it('[VSP-006] Given files on the PC with another size, When shown, Then the observation warns they are left alone', () => {
    expect(toObservationView(status({ state: 'copied', copiedFiles: 1, newFiles: 0, differentFiles: 1 }))).toMatchObject({
      stateLine: '1 file on the PC',
      warning: '1 file on the PC has the same name but another size, so it is left alone.'
    })
    expect(toObservationView(status({ differentFiles: 2 })).warning).toBe('2 files on the PC have the same name but another size, so they are left alone.')
  })

  it('[VSP-001] [VSP-010] Given a survey, When shown, Then it sums up what is new and says whether it fits', () => {
    const survey: VesperaSurvey = {
      host: '10.0.0.1', port: 21, landingRoot: 'D:\\raw', observations: [status(), status({ kind: 'darks', folder: 'expert mode' })], newFiles: 412, newBytes: 1600 * MB,
      space: { neededBytes: 1616 * MB, fits: true, headroomBytes: 4 * 1024 * 1024 * MB, shortBytes: null }
    }
    expect(toVesperaSurveyView(survey)).toMatchObject({
      ok: true, address: '10.0.0.1', summary: '1 observation on the scope, 412 new files (1.6 GB) to copy.', spaceLine: '4.0 TB would be left free where copies land.', spaceShort: false
    })
    const short = toVesperaSurveyView({ ...survey, port: 2121, space: { neededBytes: 1, fits: false, headroomBytes: null, shortBytes: 2 * MB } })
    expect(short).toMatchObject({ address: '10.0.0.1:2121', spaceLine: 'Copying everything needs 2.0 MB more room where copies land.', spaceShort: true })
    expect(toVesperaSurveyView({ ...survey, newFiles: 0, space: null })).toMatchObject({ summary: '1 observation on the scope, and everything is on the PC.', spaceLine: null })
  })

  it('[VSP-011] Given a copy under way, When shown, Then it gives the file count, bytes, speed and time left', () => {
    expect(toVesperaProgressView(progress(), null)).toEqual({
      state: 'copying', running: true, headline: 'Copying 120 of 412 files', detail: '300.0 MB of 1.6 GB, 4.0 MB/s, about 5 min left',
      fraction: 300 / 1600, current: 'M 42/obs/01-images-initial/img-0120.fits', error: null, indexing: null
    })
    expect(toVesperaProgressView(progress({ pace: copyPace(1, 2, 0) }), null).detail).toBe('300.0 MB of 1.6 GB')
    expect(toVesperaProgressView(progress({ state: 'connecting', totalFiles: 0, totalBytes: 0 }), null)).toMatchObject({ running: true, headline: 'Connecting to the Vespera…', detail: null })
  })

  it('[VSP-007] [VSP-009] [VSP-010] Given a copy that failed, was cancelled or found no room, When shown, Then it says what happened and that copying again carries on', () => {
    expect(toVesperaProgressView(progress({ state: 'failed', error: 'The connection to the scope was lost.' }), null)).toMatchObject({
      running: false,
      headline: 'The copy stopped after 119 files.',
      error: 'The connection to the scope was lost. Files already copied are kept; Copy again carries on from the next one.',
      detail: '3 files already on the PC were skipped.'
    })
    expect(toVesperaProgressView(progress({ state: 'failed', shortBytes: 5 * MB, doneFiles: 0, skippedFiles: 0 }), null).error).toBe('Nothing was copied: the folder copies land in needs 5.0 MB more room.')
    expect(toVesperaProgressView(progress({ state: 'cancelled', doneFiles: 1, skippedFiles: 1 }), null)).toMatchObject({ headline: 'Cancelled after 1 file. Copy again carries on from there.', detail: '1 file already on the PC was skipped.' })
    expect(toVesperaProgressView(progress({ state: 'failed', error: null }), null).error).toMatch(/^The copy failed\./)
  })

  it('[VSP-003] [VSP-008] Given a copy that ended, When shown, Then it says where the files went and how indexing them is going', () => {
    expect(toVesperaProgressView(progress({ state: 'done', doneFiles: 412 }), 'Scanning…')).toMatchObject({ headline: 'Copied 412 files to D:\\Astro\\raw.', indexing: 'Scanning…' })
    expect(toVesperaProgressView(progress({ state: 'done', totalFiles: 0, doneFiles: 0 }), null).headline).toBe('Nothing new to copy: every file is already on the PC.')
    expect(toVesperaProgressView(progress({ state: 'idle' }), null).headline).toBe('No copy has run yet.')
    expect(indexingText({ kind: 'none' })).toBeNull()
    expect(indexingText({ kind: 'home-scan', status: 'scanning', error: null })).toMatch(/^Scanning the home folder/)
    expect(indexingText({ kind: 'home-scan', status: 'done', error: null })).toMatch(/show on their targets/)
    expect(indexingText({ kind: 'home-scan', status: 'error', error: 'disk gone' })).toBe('The home folder scan failed: disk gone. Scan again from Library.')
    expect(indexingText({ kind: 'home-scan', status: 'cancelled', error: null })).toMatch(/cancelled/)
    expect(indexingText({ kind: 'home-scan', status: 'idle', error: null })).toBeNull()
    expect(indexingText({ kind: 'folder-scan', folder: 'D:\\V', done: false, error: null })).toBe('Scanning D:\\V for the copies…')
    expect(indexingText({ kind: 'folder-scan', folder: 'D:\\V', done: true, error: null })).toBe('D:\\V was scanned: the copies show in FITS files.')
    expect(indexingText({ kind: 'folder-scan', folder: 'D:\\V', done: true, error: 'Scan already in progress' })).toMatch(/were not scanned/)
  })

  it('[VSP-014] Given settings that could not be read, When shown, Then each says what is used instead', () => {
    const view = toVesperaSettingsView(parseVesperaSettings({ vespera_host: 'nonsense here', vespera_formats: 'json' }, '/home/raw'))
    expect(view).toEqual({
      address: '10.0.0.1', landingRoot: '/home/raw', landingIsDefault: true, formats: ['fits', 'json'],
      notes: ['The saved Vespera address is not an address, so 10.0.0.1 is used.', 'The saved kinds of file to copy include no images, so FITS and JSON are copied.']
    })
    expect(vesperaAddress({ host: 'v', port: 2121 })).toBe('v:2121')
    expect(formatTakenAt('2024-03-10')).toBe('10 Mar 2024')
    expect(formatTakenAt('nonsense')).toBeNull()
    expect(formatTakenAt(null)).toBeNull()
  })

  it('[VSP-003] [VSP-013] Given copy choices from the page, When validated, Then sane ones pass and empty or oversized ones are refused', () => {
    const start = schemas['vespera:start']
    expect(start.safeParse({ choices: [{ folder: 'M 42', kind: 'observation', target: 'Orion' }] }).success).toBe(true)
    expect(start.safeParse({ choices: [] }).success).toBe(false)
    expect(start.safeParse({ choices: [{ folder: '', kind: 'observation' }] }).success).toBe(false)
    expect(start.safeParse({ choices: [{ folder: 'x', kind: 'flats' }] }).success).toBe(false)
    expect(start.safeParse({ choices: [{ folder: 'x', kind: 'darks', target: 'y'.repeat(121) }] }).success).toBe(false)
  })
})
