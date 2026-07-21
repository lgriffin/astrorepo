import { describe, it, expect } from 'vitest'
import { isAstronomicalName, extractAstronomicalName } from '../../src/main/services/astro-names'

describe('AstroNames', () => {
  describe('isAstronomicalName', () => {
    it('Given a Messier name "M31", When tested, Then returns true', () => {
      expect(isAstronomicalName('M31')).toBe(true)
    })

    it('Given a Messier name with space "M 42", When tested, Then returns true', () => {
      expect(isAstronomicalName('M 42')).toBe(true)
    })

    it('Given an NGC name "NGC7000", When tested, Then returns true', () => {
      expect(isAstronomicalName('NGC7000')).toBe(true)
    })

    it('Given an NGC name with space "NGC 2244", When tested, Then returns true', () => {
      expect(isAstronomicalName('NGC 2244')).toBe(true)
    })

    it('Given an IC name "IC1396", When tested, Then returns true', () => {
      expect(isAstronomicalName('IC1396')).toBe(true)
    })

    it('Given a Sharpless name "Sh2-132", When tested, Then returns true', () => {
      expect(isAstronomicalName('Sh2-132')).toBe(true)
    })

    it('Given an Abell name "Abell 2065", When tested, Then returns true', () => {
      expect(isAstronomicalName('Abell 2065')).toBe(true)
    })

    it('Given a Barnard name "B33", When tested, Then returns true', () => {
      expect(isAstronomicalName('B33')).toBe(true)
    })

    it('Given a Caldwell name "C14", When tested, Then returns true', () => {
      expect(isAstronomicalName('C14')).toBe(true)
    })

    it('Given a van den Bergh name "vdB142", When tested, Then returns true', () => {
      expect(isAstronomicalName('vdB142')).toBe(true)
    })

    it('Given a regular folder name "Summer 2025", When tested, Then returns false', () => {
      expect(isAstronomicalName('Summer 2025')).toBe(false)
    })

    it('Given an empty string, When tested, Then returns false', () => {
      expect(isAstronomicalName('')).toBe(false)
    })

    it('Given "Processing", When tested, Then returns false', () => {
      expect(isAstronomicalName('Processing')).toBe(false)
    })

    it('Given "NGC" alone without number, When tested, Then returns false', () => {
      expect(isAstronomicalName('NGC')).toBe(false)
    })

    it('Given whitespace-padded " M31 ", When tested, Then returns true', () => {
      expect(isAstronomicalName(' M31 ')).toBe(true)
    })

    it('Given "Camera", When tested, Then returns false (C pattern requires end anchor)', () => {
      expect(isAstronomicalName('Camera')).toBe(false)
    })

    it('Given "B33 something", When tested, Then returns false (B pattern requires end anchor)', () => {
      expect(isAstronomicalName('B33 something')).toBe(false)
    })
  })

  describe('extractAstronomicalName', () => {
    it('Given "PixInsight M31", When extracted, Then returns "M31"', () => {
      expect(extractAstronomicalName('PixInsight M31')).toBe('M31')
    })

    it('Given "NGC7000_Ha_120s", When extracted, Then returns "NGC7000"', () => {
      expect(extractAstronomicalName('NGC7000_Ha_120s')).toBe('NGC7000')
    })

    it('Given "2025-06-15_IC1396_session", When extracted, Then returns "IC1396"', () => {
      expect(extractAstronomicalName('2025-06-15_IC1396_session')).toBe('IC1396')
    })

    it('Given "Sh2-132 RGB final", When extracted, Then returns "Sh2-132"', () => {
      expect(extractAstronomicalName('Sh2-132 RGB final')).toBe('Sh2-132')
    })

    it('Given "NGC 7000 Narrowband", When extracted, Then returns "NGC 7000"', () => {
      expect(extractAstronomicalName('NGC 7000 Narrowband')).toBe('NGC 7000')
    })

    it('Given text with no astronomical name, When extracted, Then returns null', () => {
      expect(extractAstronomicalName('Summer vacation photos')).toBeNull()
    })

    it('Given empty string, When extracted, Then returns null', () => {
      expect(extractAstronomicalName('')).toBeNull()
    })

    it('Given "M31" at start, When extracted, Then returns "M31"', () => {
      expect(extractAstronomicalName('M31')).toBe('M31')
    })

    it('Given a filename like "final_Abell2065_processed", When extracted, Then returns "Abell2065"', () => {
      expect(extractAstronomicalName('final_Abell2065_processed')).toBe('Abell2065')
    })
  })
})
