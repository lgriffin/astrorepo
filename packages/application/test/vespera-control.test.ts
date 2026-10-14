import { describe, expect, it } from 'vitest'
import { makeVesperaControl, type VesperaRequest } from '@astro/application'
import { FixedClock, InMemoryLandingArea, InMemoryScope } from '@astro/testkit'

const OBS = '/user/2024-03-10_21-33-02_M 42'
const LANDED = '/nas/home/raw/M 42/2024-03-10_21-33-02_M 42'

function rig() {
  const landing = new InMemoryLandingArea()
  const scope = new InMemoryScope(landing)
    .put(`${OBS}/01-images-initial/img-0001.fits`, 'frame-one')
    .put(`${OBS}/01-images-initial/img-0002.fits`, 'frame-two')
    .put(`${OBS}/01-images-initial/output.jpeg`, 'jpg')
    .put(`${OBS}/observation.json`, '{}')
    .put('/user/Andromeda/01-images-initial/img-0001.fits', 'andromeda')
    .put('/expert mode/dark-0001.fits', 'dark')
  const clock = new FixedClock(new Date('2026-10-14T21:00:00Z'))
  const copied: { root: string; targets: string[] }[] = []
  const control = makeVesperaControl({ scope, landing, clock, onCopied: (root, targets) => void copied.push({ root, targets }) })
  const request: VesperaRequest = { host: '10.0.0.1', port: 21, landingRoot: '/nas/home/raw', formats: ['fits', 'json'] }
  return { landing, scope, clock, control, request, copied }
}

describe('Vespera control: looking at the scope', () => {
  it('[VSP-001] Given a scope with two observations and darks, When surveyed, Then each comes back newest first with what is new, and the connection is closed', async () => {
    const { control, request, scope, landing } = rig()
    landing.put(`${LANDED}/01-images-initial/img-0001.fits`, 'frame-one')
    const survey = await control.survey(request)
    expect(survey.observations.map(o => [o.folder, o.kind, o.files, o.copiedFiles, o.newFiles, o.state])).toEqual([
      ['2024-03-10_21-33-02_M 42', 'observation', 3, 1, 2, 'partly'],
      ['Andromeda', 'observation', 1, 0, 1, 'new'],
      ['expert mode', 'darks', 1, 0, 1, 'new']
    ])
    expect([survey.newFiles, survey.newBytes]).toEqual([4, 9 + 2 + 9 + 4])
    expect(survey.space).toMatchObject({ fits: true })
    expect(scope.openConnections).toBe(0)
    expect(scope.calls.filter(c => !/^(open|list) /.test(c))).toEqual([])
  })

  it('[VSP-012] Given no landing folder, When surveyed, Then everything shows as new and no space is judged', async () => {
    const { control, request } = rig()
    const survey = await control.survey({ ...request, landingRoot: null })
    expect(survey.space).toBeNull()
    expect(survey.observations.every(o => o.state === 'new')).toBe(true)
  })

  it('[VSP-002] Given the scope does not answer, When surveyed, Then it fails and nothing is changed', async () => {
    const { control, request, landing, scope } = rig()
    scope.unreachable = true
    await expect(control.survey(request)).rejects.toThrow(/Nothing answered at 10\.0\.0\.1:21/)
    expect(landing.disk.size).toBe(0)
  })

  it('[VSP-001] Given a scope without the user or darks folders, When surveyed, Then it fails saying it holds nothing the app can read', async () => {
    const landing = new InMemoryLandingArea()
    const scope = new InMemoryScope(landing).put('/other/x.fits', 'x')
    const control = makeVesperaControl({ scope, landing, clock: new FixedClock() })
    await expect(control.survey({ host: '10.0.0.1', port: 21, landingRoot: '/l', formats: ['fits'] })).rejects.toThrow(/no "user" or "expert mode" folder/)
    expect(scope.openConnections).toBe(0)
  })
})

describe('Vespera control: copying', () => {
  it('[VSP-003] [VSP-008] Given M 42 picked under another target name, When copied, Then its FITS and JSON land under that target with the scope folders kept, and the copies are handed on to be indexed', async () => {
    const { control, request, landing, copied } = rig()
    expect(control.start(request, [{ folder: '2024-03-10_21-33-02_M 42', kind: 'observation', target: 'Orion Nebula' }])).toEqual({ started: true })
    await control.settled()
    expect(landing.listing('/nas/home/raw')).toEqual([
      'Orion Nebula/2024-03-10_21-33-02_M 42/01-images-initial/img-0001.fits',
      'Orion Nebula/2024-03-10_21-33-02_M 42/01-images-initial/img-0002.fits',
      'Orion Nebula/2024-03-10_21-33-02_M 42/observation.json'
    ])
    expect(control.progress()).toMatchObject({ state: 'done', doneFiles: 3, totalFiles: 3, doneBytes: 20, totalBytes: 20, skippedFiles: 0, current: null, targets: ['Orion Nebula'] })
    expect(copied).toEqual([{ root: '/nas/home/raw', targets: ['Orion Nebula'] }])
  })

  it('[VSP-007] [VSP-004] Given the Wi-Fi drops on the second frame, When copied and then copied again, Then the first stays, no partial file is left, and the second run copies only what is missing', async () => {
    const { control, request, landing, scope, copied } = rig()
    scope.dropAt = `${OBS}/01-images-initial/img-0002.fits`
    control.start(request, [{ folder: '2024-03-10_21-33-02_M 42', kind: 'observation' }])
    await control.settled()
    expect(control.progress()).toMatchObject({ state: 'failed', doneFiles: 1, error: 'The connection to the scope was lost.' })
    expect(landing.listing(LANDED)).toEqual(['01-images-initial/img-0001.fits'])
    expect(copied).toHaveLength(1)
    scope.dropAt = null
    control.start(request, [{ folder: '2024-03-10_21-33-02_M 42', kind: 'observation' }])
    await control.settled()
    expect(control.progress()).toMatchObject({ state: 'done', doneFiles: 2, skippedFiles: 1 })
    expect(scope.calls.filter(c => c.startsWith('download')).map(c => c.split('/').at(-1))).toEqual(['img-0001.fits', 'img-0002.fits', 'img-0002.fits', 'observation.json'])
  })

  it('[VSP-006] Given a different file already at a landing place, When copied, Then it is left as it is and the rest are copied', async () => {
    const { control, request, landing } = rig()
    landing.put(`${LANDED}/observation.json`, 'mine, edited')
    control.start(request, [{ folder: '2024-03-10_21-33-02_M 42', kind: 'observation' }])
    await control.settled()
    expect(landing.disk.get(`${LANDED}/observation.json`)).toBe('mine, edited')
    expect(control.progress()).toMatchObject({ state: 'done', doneFiles: 2, skippedFiles: 1 })
  })

  it('[VSP-010] Given too little room where copies land, When copied, Then nothing is copied and it fails saying how much more is needed', async () => {
    const { control, request, landing, copied } = rig()
    landing.free = 10
    control.start(request, [{ folder: '2024-03-10_21-33-02_M 42', kind: 'observation' }])
    await control.settled()
    expect(control.progress()).toMatchObject({ state: 'failed', doneFiles: 0, shortBytes: 21 - 10 })
    expect(landing.disk.size).toBe(0)
    expect(copied).toEqual([])
  })

  it('[VSP-009] Given a copy under way, When cancelled, Then it stops at the next chunk, keeps what was copied, and leaves no partial file', async () => {
    const { control, request, landing, scope } = rig()
    scope.onChunk = remote => {
      if (remote.endsWith('img-0002.fits')) control.cancel()
    }
    control.start(request, [{ folder: '2024-03-10_21-33-02_M 42', kind: 'observation' }])
    await control.settled()
    expect(control.progress()).toMatchObject({ state: 'cancelled', doneFiles: 1, current: null })
    expect(landing.listing(LANDED)).toEqual(['01-images-initial/img-0001.fits'])
    expect(control.cancel()).toBe(false)
  })

  it('[VSP-011] Given a copy under way, When another copy or a survey is asked for, Then both are refused, and progress shows the file, bytes and pace', async () => {
    const { control, request, clock, scope } = rig()
    const seen: ReturnType<typeof control.progress>[] = []
    let refusedStart: unknown = null
    let refusedSurvey: unknown = null
    scope.onChunk = remote => {
      if (!remote.endsWith('img-0002.fits') || seen.length > 0) return
      clock.advance(2000)
      seen.push(control.progress())
      refusedStart = control.start(request, [{ folder: 'Andromeda', kind: 'observation' }])
      control.survey(request).catch(error => void (refusedSurvey = error))
    }
    control.start(request, [{ folder: '2024-03-10_21-33-02_M 42', kind: 'observation' }])
    await control.settled()
    expect(seen[0]).toMatchObject({ state: 'copying', current: 'M 42/2024-03-10_21-33-02_M 42/01-images-initial/img-0002.fits', doneFiles: 1, totalFiles: 3, doneBytes: 9 + 5, totalBytes: 20 })
    expect(seen[0].pace).toEqual({ fraction: 14 / 20, bytesPerSecond: 7, remainingSeconds: 1 })
    expect(refusedStart).toEqual({ started: false, reason: 'A copy is already under way.' })
    expect(String(refusedSurvey)).toMatch(/copy is under way/)
  })

  it('[VSP-012] Given no landing folder or nothing picked, When a copy is asked for, Then it is refused before connecting', () => {
    const { control, request, scope } = rig()
    expect(control.start({ ...request, landingRoot: null }, [{ folder: 'Andromeda', kind: 'observation' }])).toEqual({ started: false, reason: 'Choose the folder copies land in first.' })
    expect(control.start(request, [])).toEqual({ started: false, reason: 'Pick at least one observation to copy.' })
    expect(scope.calls).toEqual([])
    expect(control.progress()).toMatchObject({ state: 'idle', targets: [], startedAt: null, finishedAt: null })
    expect(control.cancel()).toBe(false)
  })

  it('[VSP-002] Given the scope does not answer, When a copy starts, Then it fails with the reason and nothing is handed on to index', async () => {
    const { control, request, scope, copied } = rig()
    scope.unreachable = true
    control.start(request, [{ folder: 'Andromeda', kind: 'observation' }])
    await control.settled()
    expect(control.progress()).toMatchObject({ state: 'failed', error: 'Nothing answered at 10.0.0.1:21.' })
    expect(copied).toEqual([])
  })

  it('[VSP-008] Given indexing the copies fails, When the copy ends, Then the copy still counts as done', async () => {
    const landing = new InMemoryLandingArea()
    const scope = new InMemoryScope(landing).put('/user/Andromeda/a.fits', 'a')
    const control = makeVesperaControl({ scope, landing, clock: new FixedClock(), onCopied: () => Promise.reject(new Error('scan failed')) })
    control.start({ host: '10.0.0.1', port: 21, landingRoot: '/l', formats: ['fits'] }, [{ folder: 'Andromeda', kind: 'observation' }])
    await control.settled()
    expect(control.progress()).toMatchObject({ state: 'done', doneFiles: 1 })
  })

  it('[VSP-003] Given everything already on the PC, When copied, Then it is done with nothing copied and nothing handed on', async () => {
    const { control, request, landing, copied } = rig()
    landing.put('/nas/home/raw/Andromeda/Andromeda/01-images-initial/img-0001.fits', 'andromeda')
    control.start(request, [{ folder: 'Andromeda', kind: 'observation' }])
    await control.settled()
    expect(control.progress()).toMatchObject({ state: 'done', doneFiles: 0, totalFiles: 0, skippedFiles: 1 })
    expect(copied).toEqual([])
  })

  it('[VSP-011] Given a copy still connecting, When another copy is asked for, Then it is refused', async () => {
    const { control, request } = rig()
    control.start(request, [{ folder: 'Andromeda', kind: 'observation' }])
    expect(control.progress().state).toBe('connecting')
    expect(control.start(request, [{ folder: 'Andromeda', kind: 'observation' }])).toEqual({ started: false, reason: 'A copy is already under way.' })
    await control.settled()
  })

  it('[VSP-009] Given a copy cancelled before its first file, When it runs, Then nothing is downloaded and it ends cancelled with the connection closed', async () => {
    const { control, request, scope, landing, clock } = rig()
    control.start(request, [{ folder: 'Andromeda', kind: 'observation' }])
    expect(control.cancel()).toBe(true)
    await control.settled()
    expect(control.progress()).toMatchObject({ state: 'cancelled', doneFiles: 0, finishedAt: clock.now() })
    expect(scope.calls.some(c => c.startsWith('download'))).toBe(false)
    expect(scope.openConnections).toBe(0)
    expect(landing.disk.size).toBe(0)
  })

  it('[VSP-009] Given a copy cancelled while the scope does not answer, When it ends, Then it reads as cancelled, not failed', async () => {
    const { control, request, scope } = rig()
    scope.unreachable = true
    control.start(request, [{ folder: 'Andromeda', kind: 'observation' }])
    control.cancel()
    await control.settled()
    expect(control.progress()).toMatchObject({ state: 'cancelled', error: null })
  })

  it('[VSP-003] Given two picks, one of them darks, When copied, Then only the picked folders are read, each lands under its own target, and the connection is closed', async () => {
    const { control, request, scope, landing, clock } = rig()
    control.start(request, [
      { folder: 'expert mode', kind: 'darks' },
      { folder: 'Andromeda', kind: 'observation', target: 'M 31' },
      { folder: 'Andromeda', kind: 'darks' }
    ])
    await control.settled()
    expect(control.progress()).toMatchObject({ state: 'done', doneFiles: 2, targets: ['Vespera darks', 'M 31'], finishedAt: clock.now() })
    expect(landing.listing('/nas/home/raw')).toEqual(['M 31/Andromeda/01-images-initial/img-0001.fits', 'Vespera darks/expert mode/dark-0001.fits'])
    expect(scope.calls.filter(c => c.startsWith('list')).some(c => c.includes('M 42'))).toBe(false)
    expect(scope.openConnections).toBe(0)
  })

  it('[VSP-010] Given too little room, When copied, Then the failure says the landing folder is short of room', async () => {
    const { control, request, landing } = rig()
    landing.free = 0
    control.start(request, [{ folder: 'Andromeda', kind: 'observation' }])
    await control.settled()
    expect(control.progress().error).toBe('The folder copies land in has too little room for them.')
  })

  it('[VSP-013] Given names with line breaks and files nested too deep, When surveyed, Then they are left out', async () => {
    const landing = new InMemoryLandingArea()
    const scope = new InMemoryScope(landing)
      .put('/user/obs/a/b/ok.fits', 'ok')
      .put('/user/obs/a/b/c/too-deep.fits', 'deep')
      .put('/user/obs/bad\r\nDELE x.fits', 'bad')
    const control = makeVesperaControl({ scope, landing, clock: new FixedClock() })
    const survey = await control.survey({ host: '10.0.0.1', port: 21, landingRoot: '/l', formats: ['fits'] })
    expect(survey.observations.map(o => [o.folder, o.files])).toEqual([['obs', 1]])
    expect(scope.calls.some(c => c.includes('/a/b/c'))).toBe(false)
  })
})
