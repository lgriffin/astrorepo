import fs from 'fs'
import type { Worker } from 'worker_threads'
import { frameFileKind, type FileStamp } from '@astro/domain'
import { parseFitsFile, parseFitsFileAsync, type FitsHeaderRecord, type FitsParseResult } from './parser'
import { parseCameraRawFile } from '../raw/camera-raw'

/**
 * Reads what a folder scan needs from the disk: each file's size and modified time (its stamp)
 * and each frame's header. A scan hands it small lists of files, `lanes` lists at once.
 */
export interface FrameReader {
  /** How many lists the scan should have under way at once. */
  readonly lanes: number
  /** Each file's stamp, or null when it has gone since the folder was listed. */
  stamp(paths: string[]): Promise<(FileStamp | null)[]>
  /** Each frame's header; an unreadable file comes back invalid with the reason (ING-006). */
  read(paths: string[]): Promise<FitsParseResult[]>
  /** Lets go of anything the reader holds; lists still being read fail. */
  close(): Promise<void>
}

/** Header readers on their own threads while a scan reads (NFR-023): enough to overlap the waits, never a flood. */
export const SCAN_READER_THREADS = 8
/** Lists read in place at once, each a file at a time: four files asked of the disk at once (NFR-022). */
const IN_PLACE_LANES = 4

function stampOf(filePath: string, stat: fs.Stats): FileStamp {
  return { path: filePath, sizeBytes: stat.size, modifiedAt: stat.mtime.toISOString() }
}

/** A frame's stamp read on this thread, blocking it; null when the file has gone. */
export function stampFileBlocking(filePath: string): FileStamp | null {
  try {
    return stampOf(filePath, fs.statSync(filePath))
  } catch {
    return null
  }
}

/**
 * A frame's header read on this thread. A FITS header blocks the thread until the disk answers,
 * which is what a reader thread is for; a camera RAW file is read as it always is.
 */
export function readFrameBlocking(filePath: string): Promise<FitsParseResult> {
  return frameFileKind(filePath) === 'fits' ? Promise.resolve(parseFitsFile(filePath)) : parseCameraRawFile(filePath)
}

/** A request to a reader thread, and its answer. */
export type ScanReadRequest = { id: number; op: 'stamp' | 'read'; paths: string[] }
export type ScanReadReply =
  | { id: number; stamps: (FileStamp | null)[] }
  | { id: number; results: SentFrame[] }
  | { id: number; error: string }

/**
 * A header as it crosses from a reader thread: the cards without their raw text, which a scan does
 * not store, and without the keyword map, which is built again from the cards. Copying a message
 * costs the main process time, and these two were most of it.
 */
export type SentFrame = Omit<FitsParseResult, 'headerMap'>

export function toSent({ headerMap: _map, ...result }: FitsParseResult): SentFrame {
  return { ...result, headers: result.headers.map(h => ({ keyword: h.keyword, value: h.value, comment: h.comment, raw: '' })) }
}

/** A header back from a reader thread, with its keyword map: the last card of each keyword, as the parser keeps. */
export function fromSent(sent: SentFrame): FitsParseResult {
  const headerMap = new Map<string, FitsHeaderRecord>()
  for (const h of sent.headers) if (h.keyword) headerMap.set(h.keyword, h)
  return { ...sent, headerMap }
}

/** What a reader thread does with each request: one file after another, blocking only itself. */
export async function answerScanRead({ id, op, paths }: ScanReadRequest): Promise<ScanReadReply> {
  try {
    if (op === 'stamp') return { id, stamps: paths.map(stampFileBlocking) }
    const results: SentFrame[] = []
    for (const p of paths) results.push(toSent(await readFrameBlocking(p)))
    return { id, results }
  } catch (error) {
    return { id, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Reads on the main process without blocking it, as tests and the headless server do: four lists
 * at once, a file at a time each. Node's own pool runs only four file calls at once, so more lanes
 * here would only queue.
 */
export const inPlaceFrameReader: FrameReader = {
  lanes: IN_PLACE_LANES,
  async stamp(paths) {
    const stamps: (FileStamp | null)[] = []
    for (const p of paths) stamps.push(await fs.promises.stat(p).then(stat => stampOf(p, stat), () => null))
    return stamps
  },
  async read(paths) {
    const results: FitsParseResult[] = []
    for (const p of paths) results.push(await (frameFileKind(p) === 'fits' ? parseFitsFileAsync(p) : parseCameraRawFile(p)))
    return results
  },
  async close() {}
}

interface Pending {
  request: ScanReadRequest
  resolve: (reply: ScanReadReply) => void
  reject: (error: Error) => void
}

/**
 * Reads on worker threads, each answering one list at a time with blocking reads (NFR-023). Node's
 * pool for file calls has four threads for the whole process, so a scan on the main process can
 * never have more than four files asked of the disk at once; each reader thread here asks for its
 * own. Threads start when the first list arrives and stop when the scan closes the reader. A
 * thread that dies fails the list it held, and a new one takes its place for the next list.
 */
export class WorkerFrameReader implements FrameReader {
  private readonly idle: Worker[] = []
  private readonly busy = new Map<Worker, Pending>()
  private readonly queue: Pending[] = []
  private started = 0
  private nextId = 1
  private closed = false

  constructor(private readonly createWorker: () => Worker, readonly lanes: number = SCAN_READER_THREADS) {}

  async stamp(paths: string[]): Promise<(FileStamp | null)[]> {
    const reply = await this.ask('stamp', paths)
    if (!('stamps' in reply) || reply.stamps.length !== paths.length) throw new Error('A reader thread answered with the wrong stamps')
    return reply.stamps
  }

  async read(paths: string[]): Promise<FitsParseResult[]> {
    const reply = await this.ask('read', paths)
    if (!('results' in reply) || reply.results.length !== paths.length) throw new Error('A reader thread answered with the wrong headers')
    return reply.results.map(fromSent)
  }

  async close(): Promise<void> {
    this.closed = true
    const stopping = [...this.idle, ...this.busy.keys()]
    for (const pending of [...this.busy.values(), ...this.queue.splice(0)]) pending.reject(new Error('Reading stopped'))
    this.busy.clear()
    this.idle.length = 0
    await Promise.all(stopping.map(w => w.terminate().catch(() => undefined)))
  }

  private async ask(op: ScanReadRequest['op'], paths: string[]): Promise<ScanReadReply> {
    if (this.closed) throw new Error('Reading stopped')
    const reply = await new Promise<ScanReadReply>((resolve, reject) => {
      this.queue.push({ request: { id: this.nextId++, op, paths }, resolve, reject })
      this.dispatch()
    })
    if ('error' in reply) throw new Error(reply.error)
    return reply
  }

  private dispatch(): void {
    while (this.queue.length > 0) {
      let worker: Worker | undefined
      try {
        worker = this.idle.pop() ?? (this.started < this.lanes ? this.start() : undefined)
      } catch (error) {
        // A thread that cannot even be made fails the list waiting for it, rather than leaving it queued.
        this.queue.shift()!.reject(new Error(`A reader thread could not start: ${error instanceof Error ? error.message : String(error)}`))
        continue
      }
      if (!worker) return
      const pending = this.queue.shift()!
      this.busy.set(worker, pending)
      worker.postMessage(pending.request)
    }
  }

  private start(): Worker {
    const worker = this.createWorker()
    this.started++
    worker.on('message', (reply: ScanReadReply) => {
      const pending = this.busy.get(worker)
      if (!pending || pending.request.id !== reply.id) return
      this.busy.delete(worker)
      this.idle.push(worker)
      pending.resolve(reply)
      this.dispatch()
    })
    const lost = (reason: string) => {
      const pending = this.busy.get(worker)
      const wasIdle = this.idle.indexOf(worker)
      if (!pending && wasIdle === -1) return
      this.busy.delete(worker)
      if (wasIdle !== -1) this.idle.splice(wasIdle, 1)
      this.started--
      pending?.reject(new Error(reason))
      if (!this.closed) this.dispatch()
    }
    worker.on('error', error => lost(`A reader thread failed: ${error.message}`))
    worker.on('exit', code => lost(`A reader thread stopped (exit code ${code})`))
    return worker
  }
}
