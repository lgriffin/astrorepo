import { EventEmitter } from 'events'
import type { Worker } from 'worker_threads'
import { answerScanRead, type ScanReadRequest } from '../../src/main/fits/frame-reader'

/**
 * A stand-in for a scan's reader thread: it answers each request as the real thread does, after
 * `delayMs`, and counts how many requests are under way across every thread made by `threads`.
 * A thread made after `failAfter` threads dies on its first request.
 */
export function readerThreads(options: { delayMs?: number; failFrom?: number; slowPath?: { match: string; delayMs: number } } = {}) {
  const made: FakeReaderThread[] = []
  const counts = { busy: 0, most: 0, requests: 0, terminated: 0 }
  class FakeReaderThread extends EventEmitter {
    constructor(private readonly dies: boolean) { super() }
    postMessage(request: ScanReadRequest): void {
      counts.requests++
      counts.busy++
      counts.most = Math.max(counts.most, counts.busy)
      const slow = options.slowPath && request.paths.some(p => p.includes(options.slowPath!.match))
      setTimeout(async () => {
        counts.busy--
        if (this.dies) {
          this.emit('error', new Error('thread crashed'))
          this.emit('exit', 1)
          return
        }
        this.emit('message', await answerScanRead(request))
      }, slow ? options.slowPath!.delayMs : options.delayMs ?? 1)
    }
    async terminate(): Promise<number> {
      counts.terminated++
      return 0
    }
  }
  const create = (): Worker => {
    const thread = new FakeReaderThread(options.failFrom !== undefined && made.length >= options.failFrom)
    made.push(thread)
    return thread as unknown as Worker
  }
  return { create, made, counts }
}
