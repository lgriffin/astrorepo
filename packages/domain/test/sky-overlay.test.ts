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
