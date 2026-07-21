import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'

vi.mock('fs')
vi.mock('../../src/main/services/settings', () => ({
  getSetting: vi.fn()
}))
vi.mock('../../src/main/db/connection', () => ({
  getSqlite: vi.fn(() => ({
    prepare: vi.fn(() => ({
      get: vi.fn(() => undefined),
      run: vi.fn()
    }))
  }))
}))

const { readImageThumbnail, scanImages } = await import('../../src/main/services/image-scanner')
const { getSetting } = await import('../../src/main/services/settings')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ImageScanner', () => {
  describe('readImageThumbnail', () => {
    it('Given a file that does not exist, When read, Then returns null', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      expect(readImageThumbnail('/fake/image.png')).toBeNull()
    })

    it('Given a .tif file, When read, Then returns unsupported', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      const result = readImageThumbnail('/images/target/photo.tif')
      expect(result).toEqual({ unsupported: true, filename: 'photo.tif' })
    })

    it('Given a .tiff file, When read, Then returns unsupported', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      const result = readImageThumbnail('/images/target/photo.tiff')
      expect(result).toEqual({ unsupported: true, filename: 'photo.tiff' })
    })

    it('Given a .png file under 50MB, When read, Then returns base64 data', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.statSync).mockReturnValue({ size: 1024 } as fs.Stats)
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('fake-png-data'))

      const result = readImageThumbnail('/images/target/photo.png')
      expect(result).toEqual({
        data: Buffer.from('fake-png-data').toString('base64'),
        mime: 'image/png'
      })
    })

    it('Given a .jpg file under 50MB, When read, Then returns jpeg mime type', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.statSync).mockReturnValue({ size: 2048 } as fs.Stats)
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('fake-jpg-data'))

      const result = readImageThumbnail('/images/target/photo.jpg')
      expect(result).toEqual({
        data: Buffer.from('fake-jpg-data').toString('base64'),
        mime: 'image/jpeg'
      })
    })

    it('Given a file over 50MB, When read, Then returns null', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.statSync).mockReturnValue({ size: 60 * 1024 * 1024 } as fs.Stats)

      expect(readImageThumbnail('/images/target/huge.png')).toBeNull()
    })

    it('Given a file with unsupported extension, When read, Then returns null', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      expect(readImageThumbnail('/images/target/doc.bmp')).toBeNull()
    })
  })

  describe('scanImages', () => {
    it('Given no home_folder_path setting, When scanImages is called, Then returns empty result', () => {
      vi.mocked(getSetting as ReturnType<typeof vi.fn>).mockReturnValue(null)

      const result = scanImages()
      expect(result).toEqual({ targets: [], unmatched: [], totalImages: 0 })
    })

    it('Given images directory does not exist, When scanImages is called, Then returns empty result', () => {
      vi.mocked(getSetting as ReturnType<typeof vi.fn>).mockReturnValue('/astro')
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = scanImages()
      expect(result).toEqual({ targets: [], unmatched: [], totalImages: 0 })
    })

    it('Given a folder with astronomical name containing images, When scanned, Then groups by target', () => {
      vi.mocked(getSetting as ReturnType<typeof vi.fn>).mockReturnValue('/astro')
      vi.mocked(fs.existsSync).mockReturnValue(true)

      const imagesDir = path.join('/astro', 'images')
      const m31Dir = path.join(imagesDir, 'M31')

      vi.mocked(fs.readdirSync).mockImplementation(((dir: string, opts?: { withFileTypes: boolean }) => {
        if (opts?.withFileTypes) {
          if (dir === imagesDir) {
            return [{ name: 'M31', isDirectory: () => true }]
          }
          if (dir === m31Dir) {
            return [
              { name: 'final.png', isDirectory: () => false },
              { name: 'Ha.jpg', isDirectory: () => false }
            ]
          }
          return []
        }
        return []
      }) as typeof fs.readdirSync)

      const result = scanImages()
      expect(result.targets).toHaveLength(1)
      expect(result.targets[0].name).toBe('M31')
      expect(result.targets[0].images).toHaveLength(2)
      expect(result.unmatched).toHaveLength(0)
      expect(result.totalImages).toBe(2)
    })

    it('Given a non-astronomical folder, When scanned, Then files appear as unmatched', () => {
      vi.mocked(getSetting as ReturnType<typeof vi.fn>).mockReturnValue('/astro')
      vi.mocked(fs.existsSync).mockReturnValue(true)

      const imagesDir = path.join('/astro', 'images')
      const miscDir = path.join(imagesDir, 'vacation')

      vi.mocked(fs.readdirSync).mockImplementation(((dir: string, opts?: { withFileTypes: boolean }) => {
        if (opts?.withFileTypes) {
          if (dir === imagesDir) {
            return [{ name: 'vacation', isDirectory: () => true }]
          }
          if (dir === miscDir) {
            return [{ name: 'sunset.png', isDirectory: () => false }]
          }
          return []
        }
        return []
      }) as typeof fs.readdirSync)

      const result = scanImages()
      expect(result.targets).toHaveLength(0)
      expect(result.unmatched).toHaveLength(1)
      expect(result.unmatched[0].filename).toBe('sunset.png')
    })

    it('Given a loose file with astronomical name in images root, When scanned, Then it is grouped', () => {
      vi.mocked(getSetting as ReturnType<typeof vi.fn>).mockReturnValue('/astro')
      vi.mocked(fs.existsSync).mockReturnValue(true)

      const imagesDir = path.join('/astro', 'images')

      vi.mocked(fs.readdirSync).mockImplementation(((dir: string, opts?: { withFileTypes: boolean }) => {
        if (opts?.withFileTypes && dir === imagesDir) {
          return [{ name: 'NGC7000_final.jpg', isDirectory: () => false }]
        }
        return []
      }) as typeof fs.readdirSync)

      const result = scanImages()
      expect(result.targets).toHaveLength(1)
      expect(result.targets[0].name).toBe('NGC7000')
      expect(result.targets[0].images).toHaveLength(1)
    })
  })
})
