import type { Worker } from 'worker_threads'
import type { FrameMeasurer } from '@astro/application'
import type { FrameMeasurement } from '@astro/domain'
import { measureFitsFile } from '../fits/measure-fits'

export interface MeasureRequest {
  id: number
  path: string
}
export type MeasureReply = { id: number; measurement: FrameMeasurement } | { id: number; error: string }

/**
 * FrameMeasurer over the FITS files on disk. Given a worker factory, every frame is decoded and
 * measured on one worker thread, so the main process keeps answering the window and the job
 * scheduler while a target's lights are measured (NFR-014). Without one it measures in place, as
 * tests do. A worker that dies fails what it was measuring and is replaced on the next frame.
 */
export class NodeFrameMeasurer implements FrameMeasurer {
  private worker: Worker | null = null
  private readonly pending = new Map<number, { resolve: (m: FrameMeasurement) => void; reject: (e: Error) => void }>()
  private nextId = 1

  constructor(private readonly createWorker?: () => Worker) {}

  measure(path: string): Promise<FrameMeasurement> {
    if (!this.createWorker) return measureFitsFile(path)
    const worker = this.worker ?? this.start(this.createWorker)
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      worker.ref()
      worker.postMessage({ id, path } satisfies MeasureRequest)
    })
  }

  /** Stops the worker; anything still being measured fails. */
  async dispose(): Promise<void> {
    const worker = this.worker
    this.worker = null
    this.failAll('Measuring stopped because the app is closing.')
    await worker?.terminate()
  }

  private start(createWorker: () => Worker): Worker {
    const worker = createWorker()
    worker.on('message', (reply: MeasureReply) => {
      const waiting = this.pending.get(reply.id)
      if (!waiting) return
      this.pending.delete(reply.id)
      if ('error' in reply) waiting.reject(new Error(reply.error))
      else waiting.resolve(reply.measurement)
      // An idle worker must not keep the app from quitting.
      if (this.pending.size === 0) worker.unref()
    })
    const lost = (reason: string) => {
      if (this.worker !== worker) return
      this.worker = null
      this.failAll(reason)
    }
    worker.on('error', error => lost(`Measuring failed: ${error.message}`))
    worker.on('exit', code => lost(`Measuring stopped unexpectedly (exit code ${code}). Try again.`))
    this.worker = worker
    return worker
  }

  private failAll(reason: string): void {
    for (const waiting of this.pending.values()) waiting.reject(new Error(reason))
    this.pending.clear()
  }
}
