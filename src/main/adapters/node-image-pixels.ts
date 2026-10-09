import type { Worker } from 'worker_threads'
import type { ImagePixels, WcsHeader } from '@astro/application'
import type { ImageInspection, ImagePreview, PreviewChannel } from '@astro/domain'
import { inspectPath, previewPath } from '../fits/inspect-image'

export type PixelsRequest =
  | { id: number; op: 'inspect'; path: string }
  | { id: number; op: 'preview'; path: string; maxWidth: number; channel?: PreviewChannel }

export type PixelsReply =
  | { id: number; inspection: ImageInspection }
  | { id: number; preview: ImagePreview; header: WcsHeader }
  | { id: number; error: string }

type Answer = ImageInspection | { preview: ImagePreview; header: WcsHeader }

/**
 * ImagePixels over the files on disk. Given a worker factory, every image is decoded on one worker
 * thread and only its statistics and small preview cross back, so the main process keeps
 * answering the window while a full frame is read (NFR-019). Without one it reads in place, as
 * tests do. A worker that dies fails what it was reading and is replaced on the next request.
 */
export class NodeImagePixels implements ImagePixels {
  private worker: Worker | null = null
  private readonly pending = new Map<number, { resolve: (a: Answer) => void; reject: (e: Error) => void }>()
  private nextId = 1

  constructor(private readonly createWorker?: () => Worker) {}

  inspect(path: string): Promise<ImageInspection> {
    if (!this.createWorker) return inspectPath(path)
    return this.send({ id: this.nextId++, op: 'inspect', path }) as Promise<ImageInspection>
  }

  preview(path: string, options: { maxWidth: number; channel?: PreviewChannel }): Promise<{ preview: ImagePreview; header: WcsHeader }> {
    if (!this.createWorker) return previewPath(path, options)
    return this.send({ id: this.nextId++, op: 'preview', path, ...options }) as Promise<{ preview: ImagePreview; header: WcsHeader }>
  }

  /** Stops the worker; anything still being read fails. */
  async dispose(): Promise<void> {
    const worker = this.worker
    this.worker = null
    this.failAll('Reading stopped because the app is closing.')
    await worker?.terminate()
  }

  private send(request: PixelsRequest): Promise<Answer> {
    const worker = this.worker ?? this.start(this.createWorker!)
    return new Promise((resolve, reject) => {
      this.pending.set(request.id, { resolve, reject })
      worker.ref()
      worker.postMessage(request)
    })
  }

  private start(createWorker: () => Worker): Worker {
    const worker = createWorker()
    worker.on('message', (reply: PixelsReply) => {
      const waiting = this.pending.get(reply.id)
      if (!waiting) return
      this.pending.delete(reply.id)
      if ('error' in reply) waiting.reject(new Error(reply.error))
      else if ('inspection' in reply) waiting.resolve(reply.inspection)
      else waiting.resolve({ preview: reply.preview, header: reply.header })
      // An idle worker must not keep the app from quitting.
      if (this.pending.size === 0) worker.unref()
    })
    const lost = (reason: string) => {
      if (this.worker !== worker) return
      this.worker = null
      this.failAll(reason)
    }
    worker.on('error', error => lost(`Reading the image failed: ${error.message}`))
    worker.on('exit', code => lost(`Reading the image stopped unexpectedly (exit code ${code}). Try again.`))
    this.worker = worker
    return worker
  }

  private failAll(reason: string): void {
    for (const waiting of this.pending.values()) waiting.reject(new Error(reason))
    this.pending.clear()
  }
}
