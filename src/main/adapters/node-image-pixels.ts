import type { Worker } from 'worker_threads'
import type { ImagePixels, WcsHeader } from '@astro/application'
import type { ImageInspection, ImagePreview, PreviewChannel } from '@astro/domain'
import { openPath, previewPath } from '../fits/inspect-image'

export type PixelsRequest =
  | { id: number; op: 'open'; path: string; maxWidth: number }
  | { id: number; op: 'preview'; path: string; maxWidth: number; channel?: PreviewChannel }

export type PixelsReply =
  | { id: number; inspection?: ImageInspection; preview: ImagePreview; header: WcsHeader }
  | { id: number; error: string }

type Opened = { inspection: ImageInspection; preview: ImagePreview; header: WcsHeader }
type Answer = { inspection?: ImageInspection; preview: ImagePreview; header: WcsHeader }

/**
 * Runs each task once the one before has settled. The worker reads requests through one of these,
 * so it decodes one full frame at a time however many arrive together (NFR-019).
 */
export function serialQueue(): <T>(task: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve()
  return task => {
    const run = tail.then(task, task)
    tail = run.catch(() => undefined)
    return run
  }
}

/** The worker's answer to one request, and the preview bytes to hand over rather than copy. */
export async function answerPixels(request: PixelsRequest): Promise<{ reply: PixelsReply; transfer: ArrayBuffer[] }> {
  try {
    const read = request.op === 'open' ? await openPath(request.path, { maxWidth: request.maxWidth }) : await previewPath(request.path, { maxWidth: request.maxWidth, channel: request.channel })
    return { reply: { id: request.id, ...read }, transfer: [read.preview.data.buffer as ArrayBuffer] }
  } catch (error) {
    return { reply: { id: request.id, error: error instanceof Error ? error.message : String(error) }, transfer: [] }
  }
}

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

  open(path: string, options: { maxWidth: number }): Promise<Opened> {
    if (!this.createWorker) return openPath(path, options)
    return this.send({ id: this.nextId++, op: 'open', path, ...options }) as Promise<Opened>
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
      else waiting.resolve(reply.inspection ? { inspection: reply.inspection, preview: reply.preview, header: reply.header } : { preview: reply.preview, header: reply.header })
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
