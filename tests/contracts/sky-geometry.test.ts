import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import type { SolveIO } from '@astro/application'
import { astapResultPath, type JobCommand } from '@astro/domain'
import { FakePlateSolver, InMemoryMosaicStore, InMemorySolveStore, skyFile } from '@astro/testkit'
import {
  CONTRACT_SOLUTION,
  MOSAIC_TARGET,
  mosaicStoreContract,
  plateSolverContract,
  SKY_SEED,
  solveStoreContract,
  type SolverRig
} from '@astro/testkit/contracts/sky-geometry.contract'
import { AstapPlateSolver, SirilPlateSolver } from '../../src/main/adapters/node-plate-solvers'
import { SqliteMosaicStore, SqliteSolveStore } from '../../src/main/adapters/sqlite-sky-geometry'
import { seedFitsFile, seedFitsScan, seedIntegrationGoal, seedTarget, setupTestDb, teardownTestDb } from '../helpers/setup'

const temps: string[] = []
function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-solve-'))
  temps.push(dir)
  return dir
}

afterEach(() => {
  for (const d of temps.splice(0)) fs.rmSync(d, { recursive: true, force: true })
  teardownTestDb()
})

const ASTAP_INI = (solved: boolean) =>
  solved
    ? `PLTSOLVD=T\r\nCRVAL1=${CONTRACT_SOLUTION.raDeg}\r\nCRVAL2=${CONTRACT_SOLUTION.decDeg}\r\nCD1_1=-6.638E-04\r\nCD1_2=0\r\nCD2_1=0\r\nCD2_2=6.638E-04\r\n`
    : 'PLTSOLVD=F\r\nERROR=No star database found!\r\n'

const SIRIL_LOG = (solved: boolean) =>
  solved
    ? `log: Resolution:      2.390 arcsec/px\nlog: Rotation:        +10.00 deg\nlog: Image center: alpha: 00h42m44.33s, delta: +41°16'07.7"\n`
    : 'log: Plate solving failed: not enough stars\n'

const listing = (dir: string) => () =>
  Promise.resolve(
    fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .sort()
          .map(n => `${n}:${fs.readFileSync(path.join(dir, n)).toString('hex')}`)
      : []
  )

/** A real source folder and work folder, with a scripted program in place of ASTAP or Siril. */
function rig(solver: AstapPlateSolver | SirilPlateSolver | FakePlateSolver, run: (command: JobCommand) => Promise<{ exitCode: number | null; error: string | null; output: string }>): SolverRig {
  const root = tempDir()
  const source = path.join(root, 'source')
  const work = path.join(root, 'work', 'solve', 'm31')
  fs.mkdirSync(source, { recursive: true })
  fs.writeFileSync(path.join(source, 'Light_001.fits'), Buffer.from('SIMPLE  =                    T'))
  return {
    solver,
    program: solver.id === 'astap' ? 'C:/Program Files/astap/astap_cli.exe' : 'C:/Program Files/Siril/bin/siril-cli.exe',
    file: { path: path.join(source, 'Light_001.fits'), widthPx: 1080, heightPx: 1920, hint: { raDeg: 10.68, decDeg: 41.27 }, optics: { focalMm: 250, pixelUm: 2.9 } },
    workDir: work,
    io: { run },
    sourceState: listing(source),
    leftovers: listing(work)
  }
}

plateSolverContract('fake', async result => {
  const solver = new FakePlateSolver('astap')
  const r = rig(solver, async () => ({ exitCode: 0, error: null, output: '' }))
  if (result === 'solved') solver.answer(r.file.path, { ok: true, field: { ...CONTRACT_SOLUTION, rotationDeg: 0, scaleArcsec: 2.39, widthPx: 1080, heightPx: 1920 } })
  return r
})

plateSolverContract('ASTAP', async result =>
  rig(new AstapPlateSolver(), async command => {
    // ASTAP writes its .ini (and, with -wcs, a .wcs) beside the image it was given.
    const image = command.args[command.args.indexOf('-f') + 1]
    fs.writeFileSync(astapResultPath(image), ASTAP_INI(result === 'solved'))
    fs.writeFileSync(image.replace(/\.fits?$/, '.wcs'), 'SIMPLE')
    return { exitCode: result === 'solved' ? 0 : 32, error: null, output: '' }
  })
)

plateSolverContract('Siril', async result =>
  rig(new SirilPlateSolver(), async () => ({ exitCode: result === 'solved' ? 0 : 1, error: null, output: SIRIL_LOG(result === 'solved') }))
)

describe('Node plate solvers', () => {
  it('[SKY-001, NFR-018] Given ASTAP, When it solves, Then it runs on a hard link or copy named solve.fits in the work folder, with the hint and field height', async () => {
    const seen: { args: string[]; staged: string }[] = []
    const r = rig(new AstapPlateSolver(), async command => {
      const image = command.args[1]
      seen.push({ args: command.args, staged: fs.readFileSync(image, 'utf8') })
      fs.writeFileSync(astapResultPath(image), ASTAP_INI(true))
      return { exitCode: 0, error: null, output: '' }
    })
    const outcome = await r.solver.solve(r.program, r.file, r.workDir, r.io)
    expect(outcome.ok).toBe(true)
    expect(seen[0].args.slice(0, 2)).toEqual(['-f', path.join(r.workDir, 'solve.fits')])
    expect(seen[0].args).toEqual(expect.arrayContaining(['-ra', '0.712', '-spd', '131.27', '-fov', '1.276']))
    expect(seen[0].staged).toContain('SIMPLE')
  })

  it('[SKY-001] Given ASTAP leaves no result file, When it solves, Then the exit code is explained', async () => {
    const r = rig(new AstapPlateSolver(), async () => ({ exitCode: 2, error: null, output: '' }))
    expect(await r.solver.solve(r.program, { ...r.file, optics: null }, r.workDir, r.io)).toEqual({ ok: false, reason: 'ASTAP found too few stars to solve it.' })
    const crashed = rig(new AstapPlateSolver(), async () => ({ exitCode: null, error: 'spawn ENOENT', output: '' }))
    expect(await crashed.solver.solve(crashed.program, crashed.file, crashed.workDir, crashed.io)).toEqual({ ok: false, reason: 'spawn ENOENT' })
  })

  it('[SKY-001] Given a source file that cannot be read, When solved, Then it fails with a reason and runs nothing', async () => {
    const runs: JobCommand[] = []
    const r = rig(new AstapPlateSolver(), async command => (runs.push(command), { exitCode: 0, error: null, output: '' }))
    const outcome = await r.solver.solve(r.program, { ...r.file, path: path.join(tempDir(), 'gone.fit') }, r.workDir, r.io)
    expect(outcome).toMatchObject({ ok: false, reason: expect.stringMatching(/^The file could not be placed in the work folder to solve/) })
    expect(runs).toEqual([])
  })

  it("[SKY-001] Given Siril, When it solves, Then its script loads the copy from the work folder and a crash is reported as Siril's", async () => {
    let script = ''
    const io: SolveIO = {
      run: async command => {
        script = fs.readFileSync(command.args[3], 'utf8')
        expect(command.args.slice(0, 2)).toEqual(['-d', r.workDir])
        return { exitCode: 1, error: null, output: 'log: starting\n' }
      }
    }
    const r = rig(new SirilPlateSolver(), io.run)
    expect(await r.solver.solve(r.program, r.file, r.workDir, io)).toEqual({ ok: false, reason: 'Siril stopped without a solution (exit code 1).' })
    expect(script).toBe('requires 1.2.0\nload "solve.fits"\nplatesolve 10.68,41.27 -focal=250 -pixelsize=2.9\n')
    const crashed = rig(new SirilPlateSolver(), async () => ({ exitCode: null, error: 'Siril was stopped.', output: '' }))
    expect(await crashed.solver.solve(crashed.program, crashed.file, crashed.workDir, crashed.io)).toEqual({ ok: false, reason: 'Siril was stopped.' })
  })
})

solveStoreContract('in-memory', () => {
  const store = new InMemorySolveStore()
  for (const f of SKY_SEED.files) {
    store.add(
      skyFile({
        path: f.path,
        targetId: SKY_SEED.targetId,
        kind: f.kind,
        capturedAt: f.dateObs ? new Date(`${f.dateObs}Z`) : null,
        exposureSec: f.exposureSec,
        widthPx: f.width,
        heightPx: f.height,
        wcs: f.wcs ?? null
      })
    )
  }
  return store.add(skyFile({ path: '/astro/M42/L.fit', targetId: 'm42' }))
})

solveStoreContract('SQLite', () => {
  const db = setupTestDb()
  seedTarget(db, { id: SKY_SEED.targetId, canonicalName: 'M 31' })
  seedTarget(db, { id: 'm42', canonicalName: 'M 42' })
  const scan = seedFitsScan(db)
  const header = db.prepare('INSERT INTO fits_headers (id, file_id, keyword, value, comment, ordinal) VALUES (?, ?, ?, ?, NULL, ?)')
  let n = 0
  for (const f of SKY_SEED.files) {
    const id = seedFitsFile(db, scan, {
      filePath: f.path,
      targetId: SKY_SEED.targetId,
      dateObs: f.dateObs,
      exposureSec: f.exposureSec,
      isStacked: f.kind === 'master',
      ncombine: f.kind === 'master' ? 40 : null
    })
    db.prepare('UPDATE fits_files SET naxis1 = ?, naxis2 = ? WHERE id = ?').run(f.width, f.height, id)
    for (const [k, v] of Object.entries(f.wcs ?? {})) header.run(`h${++n}`, id, k, v, n)
  }
  // Neither a calibrated sub, a dark nor an unlinked light is a sky file.
  seedFitsFile(db, scan, { filePath: '/astro/M31/pp_light.fit', targetId: 'm31', isStacked: true, exposureSec: 10 })
  seedFitsFile(db, scan, { filePath: '/astro/M31/dark.fit', targetId: 'm31', imageType: 'Dark Frame', exposureSec: 10 })
  seedFitsFile(db, scan, { filePath: '/astro/loose.fit', exposureSec: 10 })
  seedFitsFile(db, scan, { filePath: '/astro/M42/L.fit', targetId: 'm42', exposureSec: 10 })
  return new SqliteSolveStore(db)
})

mosaicStoreContract('in-memory', () =>
  new InMemoryMosaicStore().addTarget(MOSAIC_TARGET).addTarget({ id: 'm31-p2', name: 'M 31 panel 2' }).addTarget({ id: 'm31-p3', name: 'M 31 panel 3' })
)

mosaicStoreContract('SQLite', () => {
  const db = setupTestDb()
  seedTarget(db, { id: 'm31', canonicalName: MOSAIC_TARGET.name, raHours: MOSAIC_TARGET.raHours, decDegrees: MOSAIC_TARGET.decDeg })
  db.prepare('UPDATE targets SET angular_size_arcmin = ? WHERE id = ?').run(MOSAIC_TARGET.sizeArcmin, 'm31')
  seedIntegrationGoal(db, { targetId: 'm31', filter: 'L', goalSeconds: 18000 })
  seedIntegrationGoal(db, { targetId: 'm31', filter: 'Ha', goalSeconds: 3600 })
  seedTarget(db, { id: 'm31-p2', canonicalName: 'M 31 panel 2' })
  seedTarget(db, { id: 'm31-p3', canonicalName: 'M 31 panel 3' })
  return new SqliteMosaicStore(db)
})

describe('SqliteMosaicStore', () => {
  it('[SKY-011] Given a link written panel first by an earlier version, When linked from either side, Then no second row is written and new rows put the lesser id first', async () => {
    const db = setupTestDb()
    for (const id of ['m31', 'm31-p2', 'm31-p3']) seedTarget(db, { id, canonicalName: id })
    db.prepare("INSERT INTO target_relationships (id, source_target_id, related_target_id, relationship_type, created_at) VALUES ('old', 'm31-p2', 'm31', 'part_of_mosaic', '2026-10-01')").run()
    const store = new SqliteMosaicStore(db)
    await store.linkPanels('m31', ['m31-p2', 'm31-p2'])
    await store.linkPanels('m31-p2', ['m31'])
    await store.linkPanels('m31-p3', ['m31'])
    const rows = db.prepare("SELECT source_target_id AS s, related_target_id AS r FROM target_relationships WHERE relationship_type = 'part_of_mosaic' ORDER BY s, r").all()
    expect(rows).toEqual([
      { s: 'm31', r: 'm31-p3' },
      { s: 'm31-p2', r: 'm31' }
    ])
  })
})

describe('Node plate solvers: no solution', () => {
  it('[SKY-005] Given ASTAP exits 1 with no result file, When it solves, Then the failure says it found no solution, so a blind retry may follow', async () => {
    const r = rig(new AstapPlateSolver(), async () => ({ exitCode: 1, error: null, output: '' }))
    expect(await r.solver.solve(r.program, r.file, r.workDir, r.io)).toEqual({ ok: false, reason: 'ASTAP found no solution.', noSolution: true })
    const noDatabase = rig(new AstapPlateSolver(), async command => {
      fs.writeFileSync(astapResultPath(command.args[1]), ASTAP_INI(false))
      return { exitCode: 32, error: null, output: '' }
    })
    expect(await noDatabase.solver.solve(noDatabase.program, noDatabase.file, noDatabase.workDir, noDatabase.io)).toEqual({ ok: false, reason: 'ASTAP could not solve it: No star database found!.' })
  })
})

describe('SqliteSolveStore', () => {
  it('[RIG-019] Given a camera RAW light beside a FITS light, When the sky files are read, Then only the FITS light is a candidate to plate solve', async () => {
    const db = setupTestDb()
    seedTarget(db, { id: 'm31', canonicalName: 'M 31' })
    const scan = seedFitsScan(db)
    seedFitsFile(db, scan, { filePath: '/astro/M31/Light_001.fit', targetId: 'm31', exposureSec: 10 })
    const raw = seedFitsFile(db, scan, { filePath: '/astro/M31/IMG_0001.CR2', targetId: 'm31', exposureSec: 120, imageType: 'Light' })
    db.prepare("UPDATE fits_files SET source_format = 'raw' WHERE id = ?").run(raw)
    expect((await new SqliteSolveStore(db).files('m31')).map(f => f.path)).toEqual(['/astro/M31/Light_001.fit'])
  })

  it('[SKY-003] Given lights with FOCALLEN and pixel size, When read, Then their optics come with them; Windows paths keep their folder', async () => {
    const db = setupTestDb()
    seedTarget(db, { id: 'm31', canonicalName: 'M 31' })
    const scan = seedFitsScan(db)
    const id = seedFitsFile(db, scan, { filePath: 'D:\\astro\\M31\\n1\\L.fit', targetId: 'm31', exposureSec: 10 })
    db.prepare('UPDATE fits_files SET xpixsz = 2.9 WHERE id = ?').run(id)
    db.prepare("INSERT INTO fits_headers (id, file_id, keyword, value, comment, ordinal) VALUES ('h', ?, 'FOCALLEN', '250', NULL, 1)").run(id)
    const [file] = await new SqliteSolveStore(db).files()
    expect(file).toMatchObject({ optics: { focalMm: 250, pixelUm: 2.9 }, folder: 'D:\\astro\\M31\\n1', widthPx: null })
  })
})
