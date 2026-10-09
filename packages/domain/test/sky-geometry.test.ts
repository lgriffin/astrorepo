import { describe, expect, it } from 'vitest'
import {
  angularDistanceDeg,
  astapCommand,
  astapExitReason,
  astapResultPath,
  chooseSolver,
  fieldFromWcs,
  fieldHeightDeg,
  fieldWidthDeg,
  footprintOf,
  footprintsOverlap,
  formatDecDms,
  formatRaHms,
  groupPanels,
  misfiledCheck,
  MOSAIC_MIN_OVERLAP,
  mosaicCsv,
  mosaicNights,
  normaliseAngle,
  offsetPosition,
  overlapsAny,
  panelGroupKey,
  parseAstapResult,
  parseSirilSolve,
  planMosaic,
  planSolves,
  rankNextActions,
  rotationByNight,
  sirilSolveCommand,
  sirilSolveScript,
  solveCopyName,
  solveJobCommand,
  TOOLS,
  type NightSky,
  type SolvedGroup,
  type ToolStatus
} from '@astro/domain'
import { skyFile, solvedField } from '@astro/testkit'

/** Degrees of RA that `offsetDeg` west or east spans at a declination, on the tangent plane. */
const angleOf = (offsetDeg: number, decDeg: number) => Math.atan2(offsetDeg * (Math.PI / 180), Math.cos(decDeg * (Math.PI / 180))) / (Math.PI / 180)

const ASTAP_SOLVED = [
  'PLTSOLVD=T',
  'CRPIX1= 5.4050000000000000E+002',
  'CRPIX2= 9.6050000000000000E+002',
  'CRVAL1= 1.0684708333333334E+001',
  'CRVAL2= 4.1268750000000000E+001',
  'CDELT1=-6.6388888888888886E-004',
  'CDELT2= 6.6388888888888886E-004',
  'CROTA1= 1.0000000000000000E+001',
  'CROTA2= 1.0000000000000000E+001',
  'CD1_1=-6.5380300000000000E-004',
  'CD1_2=-1.1528400000000000E-004',
  'CD2_1=-1.1528400000000000E-004',
  'CD2_2= 6.5380300000000000E-004',
  'CMDLINE=astap_cli -f solve.fit -r 10 -fov 1.275 -wcs',
  'WARNING='
].join('\r\n')

describe('reading where an image points', () => {
  it('[SKY-004] Given a CD matrix in the headers, When read, Then the centre, scale and rotation come from it', () => {
    const field = fieldFromWcs({ CRVAL1: '10.6847', CRVAL2: "'41.2688'", CD1_1: -6.538e-4, CD1_2: -1.1528e-4, CD2_1: -1.1528e-4, CD2_2: 6.538e-4 }, 1080, 1920)
    expect(field).toMatchObject({ raDeg: 10.6847, decDeg: 41.2688, widthPx: 1080, heightPx: 1920 })
    expect(field?.scaleArcsec).toBeCloseTo(2.39, 2)
    expect(field?.rotationDeg).toBeCloseTo(10, 0)
  })

  it('[SKY-004] Given only CDELT and CROTA2, When read, Then those give scale and rotation; a negative RA wraps', () => {
    expect(fieldFromWcs({ CRVAL1: -5, CRVAL2: 20, CDELT1: -0.0005, CDELT2: 0.0005, CROTA2: 190 }, 100, 50)).toEqual({
      raDeg: 355,
      decDeg: 20,
      rotationDeg: -170,
      scaleArcsec: 1.8,
      widthPx: 100,
      heightPx: 50,
      flipped: false
    })
    expect(fieldFromWcs({ CRVAL1: 5, CRVAL2: 20, CDELT2: 0.001 }, 100, 50)?.rotationDeg).toBe(0)
  })

  it('[SKY-001, SKY-004] Given a WCS with a positive CD determinant, When read, Then the field is mirrored; a negative one is the sky as seen', () => {
    expect(fieldFromWcs({ CRVAL1: 10, CRVAL2: 20, CD1_1: 0.001, CD2_2: 0.001 }, 100, 50)?.flipped).toBe(true)
    expect(fieldFromWcs({ CRVAL1: 10, CRVAL2: 20, CD1_1: -0.001, CD2_2: 0.001 }, 100, 50)?.flipped).toBe(false)
    expect(fieldFromWcs({ CRVAL1: 10, CRVAL2: 20, CDELT1: 0.001, CDELT2: 0.001 }, 100, 50)?.flipped).toBe(true)
    const astap = parseAstapResult('PLTSOLVD=T\nCRVAL1=10\nCRVAL2=20\nCD1_1=6.5E-04\nCD1_2=0\nCD2_1=0\nCD2_2=6.5E-04\n', 100, 50)
    expect(astap.ok && astap.field.flipped).toBe(true)
  })

  it('[SKY-004] Given a reference pixel away from the image centre, When read, Then the centre is the middle pixel taken through the matrix and a TAN projection', () => {
    // Reference pixel at the bottom left corner, 0.001° per pixel, RA increasing to the left.
    const corner = fieldFromWcs({ CRVAL1: 100, CRVAL2: 0, CRPIX1: 1, CRPIX2: 1, CD1_1: -0.001, CD2_2: 0.001 }, 1001, 1001)
    expect(corner?.raDeg).toBeCloseTo(99.5, 3)
    expect(corner?.decDeg).toBeCloseTo(0.5, 3)
    // Near the pole the projection, not a flat offset, gives the RA: 0.5° east at Dec 80 is about 2.9° of RA,
    const north = fieldFromWcs({ CRVAL1: 100, CRVAL2: 80, CRPIX1: 1, CRPIX2: 501, CDELT1: 0.001, CDELT2: 0.001, CROTA2: 0 }, 1001, 1001)
    expect(north?.raDeg).toBeCloseTo(100 + angleOf(0.5, 80), 2)
    // and the Dec falls a little off the parallel: atan(sin 80° / √(ξ² + cos² 80°)).
    expect(north?.decDeg).toBeCloseTo(79.9876, 3)
    // A reference pixel at the centre leaves CRVAL as the centre; turned 90°, CDELT and CROTA2 move it along Dec.
    expect(fieldFromWcs({ CRVAL1: 10, CRVAL2: 20, CRPIX1: 50.5, CRPIX2: 25.5, CDELT1: -0.001, CDELT2: 0.001 }, 100, 50)).toMatchObject({ raDeg: 10, decDeg: 20 })
    const turned = fieldFromWcs({ CRVAL1: 10, CRVAL2: 20, CRPIX1: 1, CRPIX2: 25.5, CDELT1: -0.001, CDELT2: 0.001, CROTA2: 90 }, 101, 50)
    expect(turned?.raDeg).toBeCloseTo(10, 3)
    expect(turned?.decDeg).toBeCloseTo(19.95, 3)
  })

  it('[SKY-004] Given cards that are not a usable WCS, When read, Then there is no field', () => {
    expect(fieldFromWcs({ CRVAL1: 10 }, 100, 100)).toBeNull()
    expect(fieldFromWcs({ CRVAL1: 10, CRVAL2: 95, CDELT1: 0.001 }, 100, 100)).toBeNull()
    expect(fieldFromWcs({ CRVAL1: 10, CRVAL2: 20 }, 100, 100)).toBeNull()
    expect(fieldFromWcs({ CRVAL1: 10, CRVAL2: 20, CD1_1: 0, CD2_2: 0 }, 100, 100)).toBeNull()
    expect(fieldFromWcs({ CRVAL1: 'x', CRVAL2: '', CDELT1: null }, 100, 100)).toBeNull()
    expect(fieldFromWcs({ CRVAL1: 10, CRVAL2: 20, CDELT1: 0.001 }, 0, 100)).toBeNull()
  })

  it('[SKY-001] Given the .ini ASTAP writes for a solved image, When parsed, Then the field comes back', () => {
    const r = parseAstapResult(ASTAP_SOLVED, 1080, 1920)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.field.raDeg).toBeCloseTo(10.6847, 3)
    expect(r.field.decDeg).toBeCloseTo(41.2688, 3)
    expect(r.field.scaleArcsec).toBeCloseTo(2.39, 2)
    expect(fieldWidthDeg(r.field)).toBeCloseTo(0.717, 2)
    expect(fieldHeightDeg(r.field)).toBeCloseTo(1.275, 2)
  })

  it('[SKY-001] Given ASTAP failed, When its .ini or exit code is read, Then the reason is a plain sentence, a missing star database included', () => {
    expect(parseAstapResult('PLTSOLVD=F\nERROR=No star database found!', 100, 100)).toEqual({ ok: false, reason: 'ASTAP could not solve it: No star database found!.' })
    expect(parseAstapResult('PLTSOLVD=F\nWARNING=Not enough stars', 100, 100)).toEqual({ ok: false, reason: 'ASTAP could not solve it: Not enough stars.', noSolution: true })
    expect(parseAstapResult('PLTSOLVD=F', 100, 100)).toEqual({ ok: false, reason: 'ASTAP found no solution.', noSolution: true })
    expect(parseAstapResult('PLTSOLVD=T\nCRVAL1=1', 100, 100)).toEqual({ ok: false, reason: 'ASTAP said it solved the image but wrote no usable position.' })
    expect(astapExitReason(32)).toMatch(/no star database/)
    expect(astapExitReason(2)).toMatch(/too few stars/)
    expect(astapExitReason(7)).toBe('ASTAP stopped without a result (exit code 7).')
    expect(astapExitReason(null)).toBe('ASTAP stopped without a result.')
  })

  it('[SKY-001, NFR-018] Given a copy in the work folder and a hint, When the ASTAP command is built, Then it is an argument array with radius, field height, RA in hours and south pole distance', () => {
    expect(astapCommand('C:/astap/astap_cli.exe', 'D:\\work\\solve\\m31\\solve.fit', { raDeg: 10.6847, decDeg: 41.2688 }, 1.2749)).toEqual({
      program: 'C:/astap/astap_cli.exe',
      args: ['-f', 'D:\\work\\solve\\m31\\solve.fit', '-r', '10', '-fov', '1.275', '-ra', '0.71231', '-spd', '131.2688', '-wcs'],
      cwd: 'D:\\work\\solve\\m31'
    })
    expect(astapCommand('astap_cli', '/w/solve.fits', null, null).args).toEqual(['-f', '/w/solve.fits', '-r', '180', '-fov', '0', '-wcs'])
    expect(astapResultPath('D:\\work\\solve\\m31\\solve.fit')).toBe('D:\\work\\solve\\m31\\solve.ini')
    expect(astapResultPath('/w/solve.fits')).toBe('/w/solve.ini')
    expect(astapResultPath('solve')).toBe('solve.ini')
    expect(solveCopyName('D:/astro/M31/Light_001.FITS')).toBe('solve.fits')
    expect(solveCopyName('/a/b/frame')).toBe('solve.fit')
  })

  it("[SKY-001] Given Siril's solver, When its script is built, Then it loads the copy and plate solves it near the hint with the optics, saving nothing", () => {
    expect(sirilSolveScript('solve.fit', { raDeg: 10.68471, decDeg: 41.26875 }, { focalMm: 250, pixelUm: 2.9 })).toBe(
      'requires 1.2.0\nload "solve.fit"\nplatesolve 10.68471,41.26875 -focal=250 -pixelsize=2.9\n'
    )
    expect(sirilSolveScript('solve.fit', null, null)).toBe('requires 1.2.0\nload "solve.fit"\nplatesolve\n')
    expect(sirilSolveCommand('siril-cli', '/w', '/w/solve.ssf')).toEqual({ program: 'siril-cli', args: ['-d', '/w', '-s', '/w/solve.ssf'], cwd: '/w' })
  })

  it("[SKY-001] Given Siril's log, When parsed, Then the centre, scale and rotation are read in either of its formats", () => {
    const old = parseSirilSolve('log: Plate solving succeeded\nlog: Resolution:      2.390 arcsec/px\nlog: Rotation:        -12.34 deg\nlog: Image center: alpha: 00h42m44s, delta: +41°16\'08"\n', 1080, 1920)
    expect(old).toEqual({ ok: true, field: { raDeg: expect.closeTo(10.6833, 3), decDeg: expect.closeTo(41.2689, 3), rotationDeg: -12.34, scaleArcsec: 2.39, widthPx: 1080, heightPx: 1920 } })
    const spaced = parseSirilSolve('Resolution: 1.200 arcsec/px\nImage center: alpha: 05 35 17.300, delta: -05 23 28.000\n', 100, 100)
    expect(spaced.ok && spaced.field).toMatchObject({ raDeg: expect.closeTo(83.822, 3), decDeg: expect.closeTo(-5.391, 3), rotationDeg: 0 })
  })

  it("[SKY-001] Given Siril's log, When it marks the rotation flipped, Then the field is mirrored; without the mark whether it is stays unknown", () => {
    const log = (rotation: string) => `Resolution: 1.200 arcsec/px\nRotation: ${rotation}\nImage center: alpha: 05 35 17.300, delta: -05 23 28.000\n`
    const flipped = parseSirilSolve(log('+12.34 deg (flipped)'), 100, 100)
    expect(flipped.ok && flipped.field).toMatchObject({ rotationDeg: 12.34, flipped: true })
    const plain = parseSirilSolve(log('+12.34 deg'), 100, 100)
    expect(plain.ok && 'flipped' in plain.field).toBe(false)
  })

  it('[SKY-001] Given Siril failed, When its log is parsed, Then its own failure line is the reason', () => {
    expect(parseSirilSolve('log: Reading image\nlog: Plate solving failed: not enough stars\n', 10, 10)).toEqual({ ok: false, reason: 'Siril could not solve it: Plate solving failed: not enough stars.', noSolution: true })
    // A missing catalogue or an unreadable file is not a field searched and missed, so no blind retry follows.
    expect(parseSirilSolve('log: Plate solving failed: no local catalogue\n', 10, 10)).toEqual({ ok: false, reason: 'Siril could not solve it: Plate solving failed: no local catalogue.' })
    expect(parseSirilSolve('log: error: could not open file\n', 10, 10)).toEqual({ ok: false, reason: 'Siril could not solve it: error: could not open file.' })
    expect(parseSirilSolve('log: done\n', 10, 10)).toEqual({ ok: false, reason: 'Siril finished without printing a solution.' })
  })
})

describe('choosing a solver', () => {
  const status = (id: ToolStatus['id'], path: string | null): ToolStatus => ({ id, path, source: path ? 'standard' : null, settingMissing: false, looked: [] })

  it('[SKY-002] Given ASTAP and Siril, When a solver is chosen, Then ASTAP is preferred, Siril is the fallback, and with neither there is none', () => {
    expect(TOOLS.find(t => t.id === 'astap')?.onPath.windows).toEqual(['astap_cli.exe', 'astap.exe'])
    expect(chooseSolver([status('siril', '/s'), status('astap', '/a')])).toEqual({ id: 'astap', program: '/a' })
    expect(chooseSolver([status('siril', '/s'), status('astap', null)])).toEqual({ id: 'siril', program: '/s' })
    expect(chooseSolver([status('siril', null)])).toBeNull()
  })

  it('[SKY-003] Given a solve task, When the job command is shown, Then it is the command the first file runs with', () => {
    const file = { path: 'D:/astro/M31/L1.fits', widthPx: 1080, heightPx: 1920, hint: { raDeg: 10, decDeg: 41 }, optics: { focalMm: 250, pixelUm: 2.9 } }
    const astap = solveJobCommand({ solver: 'astap', program: 'astap_cli', workDir: 'D:\\work\\solve\\m31', files: [file] })
    expect(astap.args.slice(0, 2)).toEqual(['-f', 'D:\\work\\solve\\m31\\solve.fits'])
    expect(astap.args).toContain('-spd')
    expect(solveJobCommand({ solver: 'astap', program: 'astap_cli', workDir: '/w', files: [] }).args.slice(0, 2)).toEqual(['-f', '/w/solve.fit'])
    expect(solveJobCommand({ solver: 'siril', program: 'siril-cli', workDir: '/w', files: [file] }).args).toEqual(['-d', '/w', '-s', '/w/solve.ssf'])
  })
})

describe('which files to solve', () => {
  const night = (iso: string) => new Date(iso)

  it('[SKY-003] Given lights from two folders over two nights and a master, When planned, Then one middle light per folder per night and the master are solved', () => {
    const files = [
      skyFile({ path: '/a/p1/1.fit', capturedAt: night('2026-10-01T21:00:00Z') }),
      skyFile({ path: '/a/p1/2.fit', capturedAt: night('2026-10-01T22:00:00Z') }),
      skyFile({ path: '/a/p1/3.fit', capturedAt: night('2026-10-02T01:00:00Z') }),
      skyFile({ path: '/a/p2/1.fit', capturedAt: night('2026-10-01T23:00:00Z') }),
      skyFile({ path: '/a/p1/4.fit', capturedAt: night('2026-10-05T22:00:00Z') }),
      skyFile({ path: '/a/stack.fit', kind: 'master', capturedAt: null }),
      skyFile({ path: '/a/nosize.fit', widthPx: null })
    ]
    const plan = planSolves(files, new Set())
    expect(plan.toSolve.map(f => f.path).sort()).toEqual(['/a/p1/2.fit', '/a/p1/4.fit', '/a/p2/1.fit', '/a/stack.fit'])
    expect(plan.fromHeaders).toEqual([])
    expect(panelGroupKey(files[0])).toBe('m31|2026-10-01|/a/p1')
    expect(panelGroupKey({ ...files[0], capturedAt: null })).toBe('m31|undated|/a/p1')
  })

  it('[SKY-003, SKY-004] Given a group already solved and one whose light carries a WCS, When planned, Then neither is solved and the WCS is stored from the headers', () => {
    const wcs = { CRVAL1: 10, CRVAL2: 41, CDELT1: -0.000664, CDELT2: 0.000664 }
    const files = [
      skyFile({ path: '/a/p1/1.fit' }),
      skyFile({ path: '/a/p1/2.fit' }),
      skyFile({ path: '/a/p2/1.fit', wcs: { CRVAL1: 10 } }),
      skyFile({ path: '/a/p2/2.fit', wcs }),
      skyFile({ path: '/a/stack.fit', kind: 'master', wcs }),
      skyFile({ path: '/a/old.fit', kind: 'master' })
    ]
    const plan = planSolves(files, new Set(['/a/p1/2.fit', '/a/old.fit']))
    expect(plan.toSolve).toEqual([])
    expect(plan.fromHeaders.map(f => f.file.path).sort()).toEqual(['/a/p2/2.fit', '/a/stack.fit'])
    expect(plan.fromHeaders[0].field.raDeg).toBe(10)
  })
})

describe('what solves say about a target', () => {
  it('[SKY-005] Given most solves far from the catalogue position, When checked, Then the target may be misfiled, with the nearest distance', () => {
    const near = solvedField(10.7, 41.3)
    const far = solvedField(83.8, -5.4)
    expect(misfiledCheck({ raDeg: 10.68, decDeg: 41.27 }, [far, far, near])).toMatchObject({ far: 2, of: 3, fieldDeg: 1.27 })
    expect(misfiledCheck({ raDeg: 10.68, decDeg: 41.27 }, [far, near])).toBeNull()
    expect(misfiledCheck(null, [far])).toBeNull()
    expect(misfiledCheck({ raDeg: 0, decDeg: 0 }, [])).toBeNull()
    // A mosaic panel a field off the centre is not far.
    expect(misfiledCheck({ raDeg: 10.68, decDeg: 41.27 }, [solvedField(10.68, 42.2)])).toBeNull()
  })

  it('[SKY-006] Given lights on three nights, When rotation is read, Then each night has its median and a half turn counts as no turn', () => {
    const at = (night: string, rotationDeg: number) => ({ night, field: solvedField(10, 41, { rotationDeg }) })
    const r = rotationByNight([at('2026-10-02', 179), at('2026-10-01', 0.4), at('2026-10-01', 0.2), at('2026-10-01', 9), at('2026-10-03', 5)])
    expect(r.nights).toEqual([
      { night: '2026-10-01', rotationDeg: 0.4 },
      { night: '2026-10-02', rotationDeg: 179 },
      { night: '2026-10-03', rotationDeg: 5 }
    ])
    expect(r.spreadDeg).toBe(6)
    expect(rotationByNight([at('2026-10-01', -179), at('2026-10-02', 1)]).spreadDeg).toBe(0)
    expect(normaliseAngle(540)).toBe(180)
    expect(normaliseAngle(-190)).toBe(170)
  })
})

describe('the mosaic planner', () => {
  const m31 = { centre: { raDeg: 10.6847, decDeg: 41.2688 }, targetWidthArcmin: 178, targetHeightArcmin: 178, field: { widthDeg: 0.72, heightDeg: 1.28 }, rotationDeg: 0, overlap: 0.2 }

  it('[SKY-007] Given M 31 and a Seestar field, When planned, Then a grid covers it with neighbours at least 15% overlapped, tiles row by row from the top left', () => {
    const plan = planMosaic(m31)
    expect(plan).toMatchObject({ columns: 5, rows: 3, overlap: 0.2, fitsOneField: false, rotationDeg: 0 })
    expect(plan.coverWidthDeg).toBeGreaterThanOrEqual(178 / 60)
    expect(plan.coverHeightDeg).toBeGreaterThanOrEqual(178 / 60)
    expect(plan.tiles).toHaveLength(15)
    expect(plan.tiles[0]).toMatchObject({ index: 1, row: 1, column: 1 })
    // Tile 1 is north and east of the centre; the middle tile is the centre.
    expect(plan.tiles[0].decDeg).toBeGreaterThan(m31.centre.decDeg)
    expect(plan.tiles[0].raDeg).toBeGreaterThan(m31.centre.raDeg)
    expect(plan.tiles[7].raDeg).toBeCloseTo(m31.centre.raDeg, 5)
    expect(plan.tiles[7].decDeg).toBeCloseTo(m31.centre.decDeg, 5)
    const step = angularDistanceDeg(plan.tiles[6].raDeg, plan.tiles[6].decDeg, plan.tiles[7].raDeg, plan.tiles[7].decDeg)
    expect(step).toBeCloseTo(0.72 * 0.8, 2)
    expect(1 - step / 0.72).toBeGreaterThanOrEqual(MOSAIC_MIN_OVERLAP)
  })

  it('[SKY-007] Given an overlap under 15% and a quarter turn, When planned, Then the overlap is raised and the grid turns with the rotation', () => {
    // A target taller than it is wide: turned 90°, the panels' long side lies along it.
    const plan = planMosaic({ ...m31, targetWidthArcmin: 40, targetHeightArcmin: 70, overlap: 0.05, rotationDeg: 90 })
    expect(plan.overlap).toBe(0.15)
    expect(plan).toMatchObject({ columns: 2, rows: 1 })
    // Turned 90°, the panels' left-right axis runs north-south, so the two tiles share an RA.
    expect(plan.tiles[0].raDeg).toBeCloseTo(plan.tiles[1].raDeg, 3)
    expect(plan.tiles[0].decDeg).toBeLessThan(plan.tiles[1].decDeg)
    expect(planMosaic({ ...m31, overlap: 0.9 }).overlap).toBe(0.5)
  })

  it('[SKY-007] Given a long thin target and panels turned 45°, When planned, Then the grid spans its extent along both turned axes and every point of it falls in a tile', () => {
    const thin = { ...m31, targetWidthArcmin: 600, targetHeightArcmin: 6, rotationDeg: 45 }
    const plan = planMosaic(thin)
    const along = (10 + 0.1) * Math.SQRT1_2
    expect(plan.coverWidthDeg).toBeGreaterThanOrEqual(along)
    expect(plan.coverHeightDeg).toBeGreaterThanOrEqual(along)
    expect(plan.rows).toBeGreaterThan(1)
    const tiles = plan.tiles.map(t => ({ raDeg: t.raDeg, decDeg: t.decDeg, widthDeg: 0.72, heightDeg: 1.28, rotationDeg: 45 }))
    // Points along the target's length and its corners, each a tiny field, all land in a tile.
    for (const [xi, eta] of [[-5, -0.05], [-5, 0.05], [5, -0.05], [5, 0.05], [-2.5, 0], [0, 0], [3.3, 0.05]]) {
      const p = offsetPosition(thin.centre, xi, eta)
      expect(tiles.some(t => footprintsOverlap(t, { ...p, widthDeg: 1e-6, heightDeg: 1e-6, rotationDeg: 0 }))).toBe(true)
    }
  })

  it('[SKY-010] Given a target smaller than the field, When planned, Then one tile on the target is proposed and it fits one field', () => {
    const plan = planMosaic({ ...m31, targetWidthArcmin: 20, targetHeightArcmin: 20 })
    expect(plan).toMatchObject({ columns: 1, rows: 1, fitsOneField: true })
    expect(plan.tiles[0]).toMatchObject({ raDeg: 10.6847, decDeg: 41.2688 })
  })

  it('[SKY-007] Given offsets on the tangent plane, When placed on the sky, Then RA wraps, the pole is handled and the distance matches', () => {
    const p = offsetPosition({ raDeg: 359.9, decDeg: 0 }, 0.5, 0)
    expect(p.raDeg).toBeCloseTo(0.4, 3)
    expect(offsetPosition({ raDeg: 0, decDeg: 89.9 }, 0, 0.5).decDeg).toBeCloseTo(89.6, 1)
    const q = offsetPosition({ raDeg: 100, decDeg: 60 }, 1, 1)
    expect(angularDistanceDeg(100, 60, q.raDeg, q.decDeg)).toBeCloseTo(Math.SQRT2, 2)
  })

  it('[SKY-007] Given positions, When formatted, Then RA reads hh:mm:ss and Dec ±dd:mm:ss', () => {
    expect(formatRaHms(83.822)).toBe('05:35:17')
    expect(formatRaHms(-15)).toBe('23:00:00')
    expect(formatRaHms(359.99999)).toBe('00:00:00')
    expect(formatDecDms(-5.391)).toBe('-05:23:28')
    expect(formatDecDms(41.26875)).toBe('+41:16:08')
    expect(formatDecDms(-0.00001)).toBe('+00:00:00')
  })

  it('[SKY-009] Given a plan, When exported, Then each tile is a CSV row with its centre and the hours it still needs', () => {
    const plan = planMosaic({ ...m31, targetWidthArcmin: 70, targetHeightArcmin: 40 })
    const csv = mosaicCsv(plan, tile => (tile === 1 ? 6 : null))
    const lines = csv.trimEnd().split('\n')
    expect(lines[0]).toBe('tile,row,column,ra,dec,ra_deg,dec_deg,rotation_deg,hours_needed')
    expect(lines).toHaveLength(3)
    expect(lines[1]).toMatch(/^1,1,1,00:4\d:\d\d,\+41:16:0\d,[\d.]+,41\.26\d+,0,6\.0$/)
    expect(lines[2].endsWith(',')).toBe(true)
  })

  it('[SKY-008] Given two nights, When every panel is checked against the altitude limit, Then a night is clear only when the lowest panel is up long enough', () => {
    const site = { latitudeDeg: 51.5, longitudeDeg: 0, elevationM: 0 }
    const sky = (night: string, lst: number): NightSky => ({
      night,
      darkStart: new Date(`${night}T20:00:00Z`),
      darkEnd: new Date(`${night}T23:00:00Z`),
      darkness: 'astronomical',
      stepHours: 0.5,
      samples: Array.from({ length: 6 }, (_, i) => ({ at: new Date(Date.parse(`${night}T20:00:00Z`) + i * 1800_000), lstHours: lst + i * 0.5, moonAltitudeDeg: -10, moonIllumination: 0, moonRaHours: 0, moonDecDeg: 0 }))
    })
    const tiles = [{ raDeg: 10, decDeg: 41 }, { raDeg: 12, decDeg: 43 }]
    const nights = mosaicNights([sky('2026-10-10', 0), sky('2026-10-11', 12)], site, tiles)
    expect(nights[0]).toMatchObject({ night: '2026-10-10', clear: true, hours: 3 })
    expect(nights[1]).toMatchObject({ night: '2026-10-11', clear: false })
    expect(mosaicNights([sky('2026-10-10', 0)], site, [])[0]).toMatchObject({ clear: false, hours: 0 })
  })
})

describe('panels of a mosaic', () => {
  const group = (key: string, targetId: string, night: string, raDeg: number, decDeg: number, lights = 10): SolvedGroup => ({
    key,
    targetId,
    night,
    lightCount: lights,
    integrationSec: lights * 10,
    field: solvedField(raDeg, decDeg)
  })

  it('[SKY-011] Given lights at the same pointing over two nights and an overlapping pointing under another name, When grouped, Then they are two panels of one mosaic', () => {
    const g = groupPanels(
      [group('a', 'm31', '2026-10-01', 10.68, 41.27), group('b', 'm31', '2026-10-02', 10.7, 41.28), group('c', 'm31-p2', '2026-10-03', 11.3, 41.27), group('d', 'm42', '2026-10-03', 83.8, -5.4)],
      null
    )
    expect(g.panels.map(p => ({ id: p.id, nights: p.nights, lights: p.lightCount, targets: p.targetIds }))).toEqual([
      { id: 1, nights: ['2026-10-01', '2026-10-02'], lights: 20, targets: ['m31'] },
      { id: 2, nights: ['2026-10-03'], lights: 10, targets: ['m31-p2'] },
      { id: 3, nights: ['2026-10-03'], lights: 10, targets: ['m42'] }
    ])
    expect(g.mosaic).toEqual([1, 2])
    expect(g.tiles).toEqual([])
  })

  it('[SKY-011] Given a planned grid, When lights are grouped, Then each fills the nearest tile within half a field and coverage adds up per tile', () => {
    const plan = planMosaic({ centre: { raDeg: 10.6847, decDeg: 41.2688 }, targetWidthArcmin: 70, targetHeightArcmin: 40, field: { widthDeg: 0.72, heightDeg: 1.28 }, rotationDeg: 0, overlap: 0.2 })
    const [t1, t2] = plan.tiles
    const g = groupPanels([group('a', 'm31', '2026-10-01', t1.raDeg, t1.decDeg), group('b', 'm31', '2026-10-02', t1.raDeg + 0.01, t1.decDeg), group('z', 'm42', '2026-10-01', 83.8, -5.4)], plan)
    expect(g.panels[0].tile).toBe(1)
    expect(g.panels[1].tile).toBeNull()
    expect(g.tiles).toEqual([
      { tile: 1, integrationSec: 200, lightCount: 20, nights: ['2026-10-01', '2026-10-02'] },
      { tile: 2, integrationSec: 0, lightCount: 0, nights: [] }
    ])
    expect(g.mosaic).toEqual([])
    const both = groupPanels([group('a', 'm31', '2026-10-01', t1.raDeg, t1.decDeg), group('b', 'm31', '2026-10-02', t2.raDeg, t2.decDeg)], plan)
    expect(both.mosaic).toEqual([1, 2])
    const tile2 = { raDeg: t2.raDeg, decDeg: t2.decDeg, widthDeg: 0.72, heightDeg: 1.28, rotationDeg: 0 }
    expect(overlapsAny(solvedField(t1.raDeg, t1.decDeg), [tile2])).toBe(true)
    expect(overlapsAny(solvedField(83.8, -5.4), [tile2])).toBe(false)
  })

  it('[SKY-011] Given 1° fields offset 0.8° east and 0.8° north, When grouped, Then their corners overlap and they are one mosaic, and turned fields are tested on their own axes', () => {
    const square = (raDeg: number, decDeg: number, rotationDeg = 0) => solvedField(raDeg, decDeg, { scaleArcsec: 3.6, widthPx: 1000, heightPx: 1000, rotationDeg })
    const corner = offsetPosition({ raDeg: 100, decDeg: 0 }, 0.8, 0.8)
    const diagonal = groupPanels(
      [
        { ...group('a', 'm31', '2026-10-01', 100, 0), field: square(100, 0) },
        { ...group('b', 'm31-p2', '2026-10-01', 0, 0), field: square(corner.raDeg, corner.decDeg) }
      ],
      null
    )
    expect(diagonal.panels).toHaveLength(2)
    expect(diagonal.mosaic).toEqual([1, 2])
    expect(footprintsOverlap(footprintOf(square(100, 0)), footprintOf(square(corner.raDeg, corner.decDeg)))).toBe(true)
    // Turned 45°, the same 1.13° offset runs along their own axes, so they part; side by side 1.2° apart they meet.
    const apart = offsetPosition({ raDeg: 100, decDeg: 0 }, 0.8, -0.8)
    expect(footprintsOverlap(footprintOf(square(100, 0, 45)), footprintOf(square(apart.raDeg, apart.decDeg, 45)))).toBe(false)
    const far = offsetPosition({ raDeg: 100, decDeg: 0 }, 1.2, 0)
    expect(footprintsOverlap(footprintOf(square(100, 0, 45)), footprintOf(square(far.raDeg, far.decDeg, 45)))).toBe(true)
    expect(footprintsOverlap(footprintOf(square(100, 0)), footprintOf(square(far.raDeg, far.decDeg)))).toBe(false)
    expect(footprintsOverlap(footprintOf(square(100, 0)), footprintOf(square(280, 0)))).toBe(false)
  })

  it('[SKY-012] Given tiles with no lights, When next actions are ranked, Then they follow tonight’s captures and lead stacking, soonest visible first', () => {
    const gap = (tile: number, nights: string[]) => ({ targetId: 'm31', targetName: 'M 31', tile, of: 3, nights, lookedAt: 30, goalSec: null })
    const ranked = rankNextActions([], null, [], [gap(2, ['2026-10-12']), gap(3, []), gap(1, ['2026-10-10'])])
    expect(ranked.map(a => (a.kind === 'mosaic-tile' ? a.id : a.kind))).toEqual(['mosaic-tile:m31:1', 'mosaic-tile:m31:2', 'mosaic-tile:m31:3'])
  })
})
