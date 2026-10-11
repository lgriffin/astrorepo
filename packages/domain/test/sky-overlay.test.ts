import { describe, expect, it } from 'vitest'
import { overlayFieldFromWcs, formatDec, formatRa, gridLines, objectsInField, pixelToSky, skyOverlay, skyToPixel, type CatalogueObject, type FieldGeometry } from '@astro/domain'

/** M42 at about 1.2″ per pixel on a 3000 × 2000 sensor, north up. */
const field: FieldGeometry = { raDeg: 83.82, decDeg: -5.39, rotationDeg: 0, scaleArcsec: 1.2, widthPx: 3000, heightPx: 2000 }

describe('Projecting the sky onto a solved image', () => {
  it('[INS-009] Given a field, When its centre is projected, Then it lands in the middle of the image', () => {
    const p = skyToPixel(field, field.raDeg, field.decDeg)!
    expect(p.x).toBeCloseTo(1500, 6)
    expect(p.y).toBeCloseTo(1000, 6)
  })

  it('[INS-009] Given north up and the sky as seen, When a point north and one east are projected, Then north is up and east is left', () => {
    const north = skyToPixel(field, field.raDeg, field.decDeg + 0.1)!
    const east = skyToPixel(field, field.raDeg + 0.1, field.decDeg)!
    expect(north.y).toBeCloseTo(1000 - 360 / 1.2, 0)
    expect(north.x).toBeCloseTo(1500, 3)
    expect(east.x).toBeLessThan(1500)
    expect(east.y).toBeCloseTo(1000, 0)
  })

  it('[INS-009] Given a mirrored field, When a point east is projected, Then it is to the right', () => {
    expect(skyToPixel({ ...field, flipped: true }, field.raDeg + 0.1, field.decDeg)!.x).toBeGreaterThan(1500)
  })

  it('[INS-009] Given a field turned 90°, When a point north is projected, Then it is to the left', () => {
    const p = skyToPixel({ ...field, rotationDeg: 90 }, field.raDeg, field.decDeg + 0.1)!
    expect(p.x).toBeCloseTo(1200, 0)
    expect(p.y).toBeCloseTo(1000, 3)
  })

  it('[INS-009] Given any pixel, When taken to the sky and back, Then it returns to the same pixel', () => {
    const turned = { ...field, rotationDeg: 33, decDeg: 61 }
    for (const [x, y] of [[0, 0], [2999, 1999], [400, 1700]]) {
      const s = pixelToSky(turned, x, y)
      const p = skyToPixel(turned, s.raDeg, s.decDeg)!
      expect(p.x).toBeCloseTo(x, 6)
      expect(p.y).toBeCloseTo(y, 6)
    }
    expect(pixelToSky(turned, 1500, 1000)).toEqual({ raDeg: turned.raDeg, decDeg: 61 })
  })

  it('[INS-009] Given a point on the far side of the sky, When projected, Then it is not placed', () => {
    expect(skyToPixel(field, field.raDeg + 180, -field.decDeg)).toBeNull()
  })
})

describe('A field from a FITS header', () => {
  it('[INS-011] Given CRVAL, CRPIX at the centre and a CD matrix, When read, Then the field has its centre, scale and rotation', () => {
    const s = 1.2 / 3600
    const t = (20 * Math.PI) / 180
    const f = overlayFieldFromWcs({
      CTYPE1: 'RA---TAN', CRVAL1: 83.82, CRVAL2: -5.39, CRPIX1: 1500.5, CRPIX2: 1000.5, NAXIS1: 3000, NAXIS2: 2000,
      CD1_1: -s * Math.cos(t), CD1_2: -s * Math.sin(t), CD2_1: -s * Math.sin(t), CD2_2: s * Math.cos(t)
    })!
    expect(f.raDeg).toBeCloseTo(83.82, 9)
    expect(f.decDeg).toBeCloseTo(-5.39, 9)
    expect(f.scaleArcsec).toBeCloseTo(1.2, 9)
    expect(f.rotationDeg).toBeCloseTo(20, 9)
    expect(f.flipped).toBe(false)
  })

  it('[INS-011] Given CDELT and CROTA2 with the reference pixel at a corner, When read, Then the centre is worked out from it', () => {
    const f = overlayFieldFromWcs({ CTYPE1: 'RA---TAN-SIP', CRVAL1: 10, CRVAL2: 41, CRPIX1: 1, CRPIX2: 1, NAXIS1: 1001, NAXIS2: 801, CDELT1: -0.001, CDELT2: 0.001, CROTA2: 0 })!
    // The reference pixel is the bottom-left, so the centre lies 400 px north and 500 px west of it.
    expect(f.decDeg).toBeCloseTo(41 + 0.4, 2)
    expect(f.raDeg).toBeLessThan(10)
    expect(f.scaleArcsec).toBeCloseTo(3.6, 9)
    const corner = skyToPixel(f, 10, 41)!
    expect(corner.x).toBeCloseTo(0.5, 1)
    expect(corner.y).toBeCloseTo(800.5, 1)
  })

  it('[INS-011] Given a CD matrix with unequal axis scales, When the field is projected, Then each axis keeps its own scale', () => {
    const f = overlayFieldFromWcs({ CRVAL1: 30, CRVAL2: 0, CRPIX1: 500.5, CRPIX2: 500.5, NAXIS1: 1000, NAXIS2: 1000, CD1_1: -0.001, CD1_2: 0, CD2_1: 0, CD2_2: 0.002 })!
    const north = skyToPixel(f, 30, 0.1)!
    const east = skyToPixel(f, 30.1, 0)!
    expect(north.x).toBeCloseTo(500, 6)
    expect(north.y).toBeCloseTo(500 - 0.1 / 0.002, 2)
    expect(east.x).toBeCloseTo(500 - 0.1 / 0.001, 2)
    expect(east.y).toBeCloseTo(500, 6)
    const back = pixelToSky(f, east.x, east.y)
    expect(back.raDeg).toBeCloseTo(30.1, 9)
    expect(back.decDeg).toBeCloseTo(0, 9)
  })

  it('[INS-011] Given a skewed CD matrix with the reference pixel off centre, When projected, Then the reference point lands on its own pixel', () => {
    const f = overlayFieldFromWcs({ CRVAL1: 120, CRVAL2: 45, CRPIX1: 101, CRPIX2: 51, NAXIS1: 800, NAXIS2: 600, CD1_1: -0.0004, CD1_2: 0.0001, CD2_1: 0.00005, CD2_2: 0.0005 })!
    const ref = skyToPixel(f, 120, 45)!
    expect(ref.x).toBeCloseTo(100.5, 6)
    expect(ref.y).toBeCloseTo(600 - 50.5, 6)
    const corner = pixelToSky(f, 0, 0)
    const again = skyToPixel(f, corner.raDeg, corner.decDeg)!
    expect(again.x).toBeCloseTo(0, 6)
    expect(again.y).toBeCloseTo(0, 6)
  })

  it('[INS-011] Given a mirrored solution, When read, Then the field says so', () => {
    expect(overlayFieldFromWcs({ CRVAL1: 10, CRVAL2: 41, NAXIS1: 100, NAXIS2: 100, CDELT1: 0.001, CDELT2: 0.001 })?.flipped).toBe(true)
  })

  it('[INS-011] Given headers without a usable solution, When read, Then there is no field', () => {
    expect(overlayFieldFromWcs({})).toBeNull()
    expect(overlayFieldFromWcs({ CRVAL1: 10, CRVAL2: 41, NAXIS1: 100, NAXIS2: 100 })).toBeNull()
    expect(overlayFieldFromWcs({ CTYPE1: 'RA---SIN', CRVAL1: 10, CRVAL2: 41, NAXIS1: 100, NAXIS2: 100, CDELT1: -1, CDELT2: 1 })).toBeNull()
    expect(overlayFieldFromWcs({ CRVAL1: 10, CRVAL2: 41, NAXIS1: 100, NAXIS2: 100, CD1_1: 0, CD2_2: 0 })).toBeNull()
    expect(overlayFieldFromWcs({ CRVAL1: 10, CRVAL2: 41, NAXIS1: 0, NAXIS2: 100, CDELT1: -1, CDELT2: 1 })).toBeNull()
    expect(overlayFieldFromWcs({ CRVAL1: 10, CRVAL2: 41, NAXIS1: 100, NAXIS2: 100, CD1_1: -0.001 })?.scaleArcsec).toBeUndefined()
    expect(overlayFieldFromWcs({ CRVAL1: 10, CRVAL2: 95, NAXIS1: 100, NAXIS2: 100, CDELT1: -0.001, CDELT2: 0.001 })).toBeNull()
    expect(overlayFieldFromWcs({ CRVAL1: 10, CRVAL2: -90.5, NAXIS1: 100, NAXIS2: 100, CDELT1: -0.001, CDELT2: 0.001 })).toBeNull()
  })
})

describe('The coordinate grid', () => {
  it('[INS-009] Given a north-up field, When the grid is drawn, Then declination lines run across and right ascension lines run up, each labelled', () => {
    const lines = gridLines(field)
    const dec = lines.filter(l => l.kind === 'dec')
    const ra = lines.filter(l => l.kind === 'ra')
    expect(dec.length).toBeGreaterThanOrEqual(2)
    expect(ra.length).toBeGreaterThanOrEqual(2)
    for (const l of dec) expect(Math.abs(l.points[0].y - l.points[l.points.length - 1].y)).toBeLessThan(20)
    for (const l of ra) expect(Math.abs(l.points[0].x - l.points[l.points.length - 1].x)).toBeLessThan(20)
    expect(dec.map(l => l.label)).toContain('−5° 20′')
    expect(ra.every(l => /^\d+h( \d\dm)?$/.test(l.label))).toBe(true)
  })

  it('[INS-009] Given the celestial pole inside the field, When the grid is drawn, Then right ascension lines fan out all round it', () => {
    const polar: FieldGeometry = { raDeg: 0, decDeg: 89.9, rotationDeg: 0, scaleArcsec: 3, widthPx: 1000, heightPx: 1000 }
    const ra = gridLines(polar).filter(l => l.kind === 'ra')
    expect(ra.length).toBeGreaterThanOrEqual(4)
    expect(new Set(ra.map(l => l.valueDeg)).size).toBe(ra.length)
  })

  it('[INS-009] Given coordinates, When labelled, Then right ascension reads in hours and minutes and declination in degrees and minutes', () => {
    expect(formatRa(83.75)).toBe('5h 35m')
    expect(formatRa(-15)).toBe('23h')
    // 5h 59m 40s and 23h 59m 50s round up to the next whole hour.
    expect(formatRa((5 + 59 / 60 + 40 / 3600) * 15)).toBe('6h')
    expect(formatRa((23 + 59 / 60 + 50 / 3600) * 15)).toBe('0h')
    expect(formatRa((5 + 59 / 60 + 20 / 3600) * 15)).toBe('5h 59m')
    expect(formatDec(-5.5)).toBe('−5° 30′')
    expect(formatDec(41)).toBe('+41°')
  })
})

describe('Catalogue labels', () => {
  const objects: CatalogueObject[] = [
    { designation: 'M42', name: 'Orion Nebula', raDeg: 83.82, decDeg: -5.39, sizeArcmin: 85 },
    { designation: 'NGC 1976', name: null, raDeg: 83.82, decDeg: -5.39, sizeArcmin: 85 },
    { designation: 'M43', name: null, raDeg: 83.879, decDeg: -5.27, sizeArcmin: 20 },
    { designation: 'NGC 1999', name: null, raDeg: 84.17, decDeg: -6.7, sizeArcmin: 2 },
    { designation: 'NGC 1980', name: null, raDeg: 83.85, decDeg: -5.6, sizeArcmin: null }
  ]

  it('[INS-010] Given catalogued objects, When placed on the field, Then only those inside appear, largest first, each spot once, with their size in pixels', () => {
    const placed = objectsInField(field, objects)
    expect(placed.map(o => o.designation)).toEqual(['M42', 'M43', 'NGC 1980'])
    expect(placed[0]).toMatchObject({ x: expect.closeTo(1500, 3), y: expect.closeTo(1000, 3), radiusPx: expect.closeTo((85 * 30) / 1.2, 6) })
    expect(placed[2].radiusPx).toBeNull()
  })

  it('[INS-010] Given a preview a quarter of the size, When the overlay is made, Then lines and labels are scaled to it', () => {
    const overlay = skyOverlay(field, objects, 0.25)
    expect(overlay.objects[0].x).toBeCloseTo(375, 3)
    expect(overlay.objects[0].radiusPx).toBeCloseTo((85 * 30) / 1.2 / 4, 6)
    expect(overlay.objects[2].radiusPx).toBeNull()
    const full = gridLines(field)
    expect(overlay.grid[0].points[0].x).toBeCloseTo(full[0].points[0].x / 4, 6)
  })
})

/** A grid line in brief: kind, value, label and point count, with its two ends to within half a pixel. */
const brief = (f: FieldGeometry, lines?: number) =>
  gridLines(f, lines).map(l => {
    const a = l.points[0]
    const b = l.points[l.points.length - 1]
    return { line: `${l.kind} ${l.valueDeg} ${l.label} n=${l.points.length}`, ends: [a.x, a.y, b.x, b.y] }
  })
const grid = (rows: string[]) =>
  rows.map(r => {
    const [line, ends] = r.split(' n=49 ')
    return { line: `${line} n=49`, ends: ends.split(/[ ,]/).map(v => expect.closeTo(Number(v), 0)) }
  })

describe('The coordinate grid, line by line', () => {
  it('[INS-009] Given M42 north up at 1.2″ a pixel, When the grid is drawn, Then four lines of each kind cross the whole image at 10′ and 1 minute of time', () => {
    expect(brief(field)).toEqual(grid([
      'dec -5.666667 −5° 40′ n=49 3000.1,1830.7 -0.1,1830.7',
      'dec -5.5 −5° 30′ n=49 3000.6,1330.6 -0.6,1330.6',
      'dec -5.333333 −5° 20′ n=49 3001.0,830.6 -1.0,830.6',
      'dec -5.166667 −5° 10′ n=49 3001.4,330.6 -1.4,330.6',
      'ra 83.5 5h 34m n=49 2455.2,2000.3 2456.3,-0.3',
      'ra 83.75 5h 35m n=49 1709.0,2000.0 1709.2,-0.6',
      'ra 84 5h 36m n=49 962.7,2000.1 962.1,-0.5',
      'ra 84.25 5h 37m n=49 216.4,2000.5 215.0,-0.1'
    ]))
  })

  it('[INS-009] Given a field across 0h, When the grid is drawn, Then right ascension runs on from 23h 59m to 0h without a jump', () => {
    const f: FieldGeometry = { raDeg: 0.05, decDeg: 10, rotationDeg: 0, scaleArcsec: 1.2, widthPx: 3000, heightPx: 2000 }
    expect(brief(f)).toEqual(grid([
      'dec 9.666667 +9° 40′ n=49 3003.1,1998.9 -3.1,1998.9',
      'dec 9.833333 +9° 50′ n=49 3002.3,1498.9 -2.3,1498.9',
      'dec 10 +10° n=49 3001.5,998.8 -1.5,998.8',
      'dec 10.166667 +10° 10′ n=49 3000.8,498.8 -0.8,498.8',
      'ra 359.75 23h 59m n=49 2387.2,2000.7 2385.4,-0.4',
      'ra 0 0h n=49 1647.9,2001.1 1647.6,-0.0',
      'ra 0.25 0h 01m n=49 908.5,2000.9 909.7,-0.2',
      'ra 0.5 0h 02m n=49 169.1,2000.2 171.9,-0.9'
    ]))
    const corner = pixelToSky(f, 3000, 0)
    expect(corner.raDeg).toBeCloseTo(359.541779, 5)
    expect(corner.decDeg).toBeCloseTo(10.332932, 5)
  })

  it('[INS-009] Given the north or south celestial pole in the field, When the grid is drawn, Then four hour lines meet at it and circles of declination ring it', () => {
    expect(brief({ raDeg: 0, decDeg: 89.9, rotationDeg: 0, scaleArcsec: 3, widthPx: 1000, heightPx: 1000 })).toEqual(grid([
      'dec 89.5 +89° 30′ n=49 500.0,-220.0 500.0,-220.0',
      'dec 89.666667 +89° 40′ n=49 500.0,-20.0 500.0,-20.0',
      'dec 89.833333 +89° 50′ n=49 500.0,180.0 500.0,180.0',
      'ra 180 12h n=49 500.0,-416.5 500.0,260.0',
      'ra 270 18h n=49 1296.5,380.0 620.0,380.0',
      'ra 0 0h n=49 500.0,1176.5 500.0,500.0',
      'ra 90 6h n=49 -296.5,380.0 380.0,380.0'
    ]))
    expect(brief({ raDeg: 0, decDeg: -89.9, rotationDeg: 0, scaleArcsec: 3, widthPx: 1000, heightPx: 1000 })).toEqual(grid([
      'dec -89.833333 −89° 50′ n=49 500.0,820.0 500.0,820.0',
      'dec -89.666667 −89° 40′ n=49 500.0,1020.0 500.0,1020.0',
      'dec -89.5 −89° 30′ n=49 500.0,1220.0 500.0,1220.0',
      'ra 180 12h n=49 500.0,740.0 500.0,1416.5',
      'ra 270 18h n=49 620.0,620.0 1296.5,620.0',
      'ra 0 0h n=49 500.0,500.0 500.0,-176.5',
      'ra 90 6h n=49 380.0,620.0 -296.5,620.0'
    ]))
  })

  it('[INS-009] Given a wide field and fewer lines asked for, When the grid is drawn, Then the steps widen to 15° and 2 hours', () => {
    expect(brief({ raDeg: 100, decDeg: 20, rotationDeg: 0, scaleArcsec: 60, widthPx: 3000, heightPx: 2000 }, 3)).toEqual(grid([
      'dec 15 +15° n=49 3211.8,1192.2 -211.8,1192.2',
      'dec 30 +30° n=49 3036.1,203.4 -36.1,203.4',
      'ra 90 6h n=49 2130.9,2015.7 2007.7,-27.3',
      'ra 120 8h n=49 199.2,2004.6 462.7,-112.6'
    ]))
  })

  it('[INS-009] Given more coordinates, When labelled, Then minutes are padded to two digits and zero reads as plus', () => {
    expect(formatRa(15 + 5 / 4)).toBe('1h 05m')
    expect(formatRa(360)).toBe('0h')
    expect(formatRa(720 + 30)).toBe('2h')
    expect(formatRa(-0.25)).toBe('23h 59m')
    expect(formatDec(0)).toBe('+0°')
    expect(formatDec(-0.5)).toBe('−0° 30′')
    expect(formatDec(1 + 5 / 60)).toBe('+1° 05′')
    expect(formatDec(-(89 + 59.6 / 60))).toBe('−90°')
  })
})

describe('A field from a FITS header, more forms', () => {
  it('[INS-011] Given no reference pixel, When read, Then the reference point is the image centre', () => {
    const f = overlayFieldFromWcs({ CRVAL1: 10, CRVAL2: 41, NAXIS1: 100, NAXIS2: 80, CDELT1: -0.001, CDELT2: 0.001 })!
    expect({ ...f.wcs, cd: f.wcs?.cd.map(v => v + 0) }).toEqual({ raDeg: 10, decDeg: 41, x: 50, y: 40, cd: [-0.001, 0, 0, 0.001] })
    expect(f.raDeg).toBeCloseTo(10, 9)
    expect(f.decDeg).toBeCloseTo(41, 9)
    expect(f.rotationDeg).toBeCloseTo(0, 9)
    expect(f).toMatchObject({ widthPx: 100, heightPx: 80, flipped: false })
  })

  it('[INS-011] Given CDELT with only CROTA1, or a mirrored CDELT turned 30°, When read, Then the rotation is 30°', () => {
    const c1 = overlayFieldFromWcs({ CRVAL1: 10, CRVAL2: 41, NAXIS1: 100, NAXIS2: 100, CDELT1: -0.001, CDELT2: 0.001, CROTA1: 30 })!
    expect(c1.rotationDeg).toBeCloseTo(30, 9)
    expect(c1.flipped).toBe(false)
    expect(c1.wcs?.cd.map(v => v.toFixed(7))).toEqual(['-0.0008660', '-0.0005000', '-0.0005000', '0.0008660'])
    const mirrored = overlayFieldFromWcs({ CRVAL1: 10, CRVAL2: 41, NAXIS1: 100, NAXIS2: 100, CDELT1: 0.001, CDELT2: 0.001, CROTA2: 30, CROTA1: 99 })!
    expect(mirrored.rotationDeg).toBeCloseTo(30, 9)
    expect(mirrored.flipped).toBe(true)
    expect(mirrored.wcs?.cd.map(v => v.toFixed(7))).toEqual(['0.0008660', '-0.0005000', '0.0005000', '0.0008660'])
  })

  it('[INS-011] Given a CD matrix missing one of its diagonal terms, When read, Then the missing term is zero and the rest still place the field', () => {
    const noCd22 = overlayFieldFromWcs({ CRVAL1: 10, CRVAL2: 41, NAXIS1: 100, NAXIS2: 100, CD1_1: 0.001, CD1_2: 0.001, CD2_1: 0.001 })!
    expect(noCd22.wcs?.cd).toEqual([0.001, 0.001, 0.001, 0])
    expect(noCd22.rotationDeg).toBeCloseTo(-135, 9)
    expect(noCd22.scaleArcsec).toBeCloseTo(3.6, 9)
    const noCd11 = overlayFieldFromWcs({ CRVAL1: 10, CRVAL2: 41, NAXIS1: 100, NAXIS2: 100, CD2_2: 0.001, CD1_2: 0.001, CD2_1: 0.001 })!
    expect(noCd11.wcs?.cd).toEqual([0, 0.001, 0.001, 0.001])
    expect(noCd11.rotationDeg).toBeCloseTo(-90, 9)
    // A CD matrix wins over CDELT when both are given.
    expect(overlayFieldFromWcs({ CRVAL1: 10, CRVAL2: 41, NAXIS1: 100, NAXIS2: 100, CD1_1: -0.002, CD2_2: 0.002, CDELT1: -0.001, CDELT2: 0.001 })?.scaleArcsec).toBeCloseTo(7.2, 9)
  })

  it('[INS-011] Given a field so coarse that north of its centre is past the horizon, When read, Then the rotation comes from the matrix itself', () => {
    const f = overlayFieldFromWcs({ CRVAL1: 10, CRVAL2: 0, NAXIS1: 2, NAXIS2: 2, CDELT1: -100, CDELT2: 100, CROTA2: 30 })!
    expect(f.rotationDeg).toBeCloseTo(30, 9)
    expect(f.scaleArcsec).toBeCloseTo(360000, 6)
  })

  it('[INS-011] Given a declination of exactly ±90°, a lower-case TAN type or a non-text type, When read, Then the field is accepted', () => {
    expect(overlayFieldFromWcs({ CRVAL1: 10, CRVAL2: 90, NAXIS1: 100, NAXIS2: 100, CDELT1: -0.001, CDELT2: 0.001 })?.decDeg).toBeCloseTo(90, 6)
    expect(overlayFieldFromWcs({ CRVAL1: 10, CRVAL2: -90, NAXIS1: 100, NAXIS2: 100, CDELT1: -0.001, CDELT2: 0.001 })?.decDeg).toBeCloseTo(-90, 6)
    expect(overlayFieldFromWcs({ CTYPE1: 'ra---tan', CRVAL1: 10, CRVAL2: 41, NAXIS1: 100, NAXIS2: 100, CDELT1: -0.001, CDELT2: 0.001 })).not.toBeNull()
    expect(overlayFieldFromWcs({ CTYPE1: true, CRVAL1: 10, CRVAL2: 41, NAXIS1: 100, NAXIS2: 100, CDELT1: -0.001, CDELT2: 0.001 })).not.toBeNull()
  })

  it('[INS-011] Given values written as text, not finite, a negative size or only one CDELT, When read, Then there is no field', () => {
    const ok = { CRVAL1: 10, CRVAL2: 41, NAXIS1: 100, NAXIS2: 100, CDELT1: -0.001, CDELT2: 0.001 }
    expect(overlayFieldFromWcs(ok)).not.toBeNull()
    expect(overlayFieldFromWcs({ ...ok, CRVAL1: '10' })).toBeNull()
    expect(overlayFieldFromWcs({ ...ok, CRVAL2: Number.NaN })).toBeNull()
    expect(overlayFieldFromWcs({ ...ok, CRVAL2: Number.POSITIVE_INFINITY })).toBeNull()
    expect(overlayFieldFromWcs({ ...ok, NAXIS1: -100 })).toBeNull()
    expect(overlayFieldFromWcs({ ...ok, NAXIS2: -100 })).toBeNull()
    expect(overlayFieldFromWcs({ ...ok, NAXIS2: 0 })).toBeNull()
    expect(overlayFieldFromWcs({ ...ok, NAXIS2: undefined })).toBeNull()
    expect(overlayFieldFromWcs({ ...ok, CDELT2: undefined })).toBeNull()
    expect(overlayFieldFromWcs({ ...ok, CDELT1: undefined })).toBeNull()
    expect(overlayFieldFromWcs({ ...ok, CTYPE1: 'RA---ZEA' })).toBeNull()
  })
})

describe('Projection details', () => {
  it('[INS-009] Given a mirrored field turned 90°, When points north and east are projected, Then the turn runs the mirrored way: north is to the right and east is down', () => {
    const f = { ...field, rotationDeg: 90, flipped: true }
    const north = skyToPixel(f, field.raDeg, field.decDeg + 0.1)!
    expect(north.x).toBeCloseTo(1800, 2)
    expect(north.y).toBeCloseTo(1000, 6)
    const east = skyToPixel(f, field.raDeg + 0.1, field.decDeg)!
    expect(east.x).toBeCloseTo(1500, 1)
    expect(east.y).toBeCloseTo(1298.67, 1)
    const back = pixelToSky(f, east.x, east.y)
    expect(back.raDeg).toBeCloseTo(field.raDeg + 0.1, 9)
    expect(back.decDeg).toBeCloseTo(field.decDeg, 9)
  })

  it('[INS-009] Given a point a quarter turn from the centre, When projected, Then it is not placed', () => {
    expect(skyToPixel(field, field.raDeg + 90, 0)).toBeNull()
    expect(skyToPixel(field, field.raDeg + 89, 0)).not.toBeNull()
  })
})

describe('Catalogue labels at the edges', () => {
  const at = (x: number, y: number, designation: string, sizeArcmin: number | null = 1): CatalogueObject => ({ designation, name: null, ...pixelToSky(field, x, y), sizeArcmin })

  it('[INS-010] Given objects just inside and just outside each edge, When placed, Then only those inside appear', () => {
    const placed = objectsInField(field, [
      at(-1, 1000, 'left out'), at(1, 1000, 'left in'),
      at(3001, 1000, 'right out'), at(2999, 1000, 'right in'),
      at(1500, -1, 'top out'), at(1500, 1, 'top in'),
      at(1500, 2001, 'bottom out'), at(1500, 1999, 'bottom in')
    ])
    expect(placed.map(o => o.designation).sort()).toEqual(['bottom in', 'left in', 'right in', 'top in'])
  })

  it('[INS-010] Given two objects 1.9 and 2.1 pixels from a first, When placed, Then only the nearer one is taken as the same object', () => {
    const placed = objectsInField(field, [at(500, 500, 'A', 10), at(501.9, 500, 'B', 20), at(500, 502.1, 'C', 5)])
    expect(placed.map(o => o.designation)).toEqual(['A', 'C'])
    expect(placed[1]).toMatchObject({ x: expect.closeTo(500, 6), y: expect.closeTo(502.1, 6), radiusPx: expect.closeTo((5 * 30) / 1.2, 9) })
  })

  it('[INS-010] Given objects of unknown size beside sized ones, When placed, Then the unknown sort as smallest', () => {
    const placed = objectsInField(field, [at(100, 100, 'unknown', null), at(200, 200, 'small', 1), at(300, 300, 'big', 30)])
    expect(placed.map(o => o.designation)).toEqual(['big', 'small', 'unknown'])
  })

  it('[INS-010] Given no preview scale, When the overlay is made, Then lines and labels are at full size', () => {
    const objects = [at(300, 400, 'X', 6)]
    const overlay = skyOverlay(field, objects)
    expect(overlay.objects).toEqual(objectsInField(field, objects))
    expect(overlay.grid).toEqual(gridLines(field))
    const half = skyOverlay(field, objects, 0.5)
    expect(half.objects[0]).toMatchObject({ x: expect.closeTo(150, 6), y: expect.closeTo(200, 6), radiusPx: expect.closeTo(75, 9) })
    expect(half.grid[3].points[5].y).toBeCloseTo(gridLines(field)[3].points[5].y / 2, 9)
  })
})
