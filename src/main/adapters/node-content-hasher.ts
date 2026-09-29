import { createHash } from 'crypto'
import fs from 'fs'
import type { ContentHasher } from '@astro/application'
import type { FileStamp } from '@astro/domain'

/** How much of each end of a file the quick key reads. Covers a FITS header and more. */
export const SAMPLE_BYTES = 64 * 1024

/**
 * SHA-256 through Node's native crypto. The blueprint named BLAKE3, but in Node the native SHA-256
 * is faster than any JavaScript BLAKE3, and hashes carry an algorithm prefix so this can change.
 * Files are opened read-only and never written.
 */
export class NodeContentHasher implements ContentHasher {
  async quickKey(file: FileStamp): Promise<string> {
    const handle = await fs.promises.open(file.path, 'r')
    try {
      const { size } = await handle.stat()
      const hash = createHash('sha256').update(`${size}:`)
      const head = Buffer.alloc(Math.min(SAMPLE_BYTES, size))
      await handle.read(head, 0, head.length, 0)
      hash.update(head)
      if (size > SAMPLE_BYTES) {
        const tailLength = Math.min(SAMPLE_BYTES, size - SAMPLE_BYTES)
        const tail = Buffer.alloc(tailLength)
        await handle.read(tail, 0, tailLength, size - tailLength)
        hash.update(tail)
      }
      return `sample-sha256:${hash.digest('hex')}`
    } finally {
      await handle.close()
    }
  }

  fullHash(path: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256')
      fs.createReadStream(path)
        .on('data', chunk => hash.update(chunk))
        .on('error', reject)
        .on('end', () => resolve(`sha256:${hash.digest('hex')}`))
    })
  }
}
