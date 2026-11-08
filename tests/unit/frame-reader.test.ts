import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fitsBytes } from '../helpers/fits'
import { readerThreads } from '../helpers/reader-threads'
import { parseFitsFile } from '../../src/main/fits/parser'
import { WorkerFrameReader, inPlaceFrameReader, answerScanRead, fromSent, toSent, SCAN_READER_THREADS } from '../../src/main/fits/frame-reader'

let dir: string
const files: string[] = []

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-reader-'))
  files.length = 0
  for (let i = 0; i < 12; i++) {
    const file = path.join(dir, `Light_${i}.fit`)
    fs.writeFileSync(file, fitsBytes({ OBJECT: 'M 42', EXPTIME: 10, FRAME: i, HISTORY: 'stacked' }))
    files.push(file)
  }
})

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('reading on reader threads', () => {
  it('[NFR-023] Given lists of frames, When read on reader threads, Then each header and stamp matches reading in place', async () => {
    const threads = readerThreads()
    const reader = new WorkerFrameReader(threads.create)
    const lists = [files.slice(0, 6), files.slice(6), [path.join(dir, 'gone.fit')]]
    const read = await Promise.all(lists.map(l => reader.read(l)))
    const stamps = await reader.stamp([...files, path.join(dir, 'gone.fit')])
    await reader.close()

    const inPlace = await Promise.all(lists.map(l => inPlaceFrameReader.read(l)))
    expect(read.flat().map(r => [r.isValid, r.error, [...r.headerMap.entries()].map(([k, h]) => [k, h.value, h.comment])]))
      .toEqual(inPlace.flat().map(r => [r.isValid, r.error, [...r.headerMap.entries()].map(([k, h]) => [k, h.value, h.comment])]))
    expect(read[2][0]).toMatchObject({ isValid: false })
    expect(stamps).toEqual(await inPlaceFrameReader.stamp([...files, path.join(dir, 'gone.fit')]))
    expect(stamps.at(-1)).toBeNull()
  })

  it('[NFR-023] Given more lists than threads, When read, Then no more threads start than lanes and each answers one list at a time', async () => {
    const threads = readerThreads({ delayMs: 5 })
    const reader = new WorkerFrameReader(threads.create, 3)
    await Promise.all(files.map(f => reader.read([f])))
    expect(threads.made).toHaveLength(3)
    expect(threads.counts.most).toBe(3)
    expect(threads.counts.requests).toBe(12)
    await reader.close()
    expect(threads.counts.terminated).toBe(3)
  })

  it('[NFR-023] Given the app reader, When it is made, Then it reads on eight threads', () => {
    expect(SCAN_READER_THREADS).toBe(8)
    expect(new WorkerFrameReader(readerThreads().create).lanes).toBe(8)
    expect(inPlaceFrameReader.lanes).toBe(4)
  })

  it('[NFR-024] Given a reader thread that dies, When it holds a list, Then that list fails and a new thread reads the next', async () => {
    const threads = readerThreads({ failFrom: 0 })
    const reader = new WorkerFrameReader(threads.create, 2)
    await expect(reader.read(files.slice(0, 2))).rejects.toThrow(/reader thread failed/)
    expect(threads.made).toHaveLength(1)
    await expect(reader.read(files.slice(2, 4))).rejects.toThrow(/reader thread/)
    expect(threads.made).toHaveLength(2)
    await reader.close()
  })

  it('[NFR-024] Given a closed reader, When asked to read, Then it refuses, and lists still waiting fail', async () => {
    const threads = readerThreads({ delayMs: 20 })
    const reader = new WorkerFrameReader(threads.create, 1)
    const first = reader.read([files[0]])
    const waiting = reader.read([files[1]])
    await reader.close()
    await expect(first).rejects.toThrow(/stopped/)
    await expect(waiting).rejects.toThrow(/stopped/)
    await expect(reader.stamp([files[0]])).rejects.toThrow(/stopped/)
  })

  it('[NFR-024] Given a thread answering with the wrong count, When read, Then the list fails rather than misfiling headers', async () => {
    const created = readerThreads()
    const reader = new WorkerFrameReader(() => {
      const thread = created.create()
      const post = thread.postMessage.bind(thread)
      ;(thread as unknown as { postMessage: (r: { paths: string[] }) => void }).postMessage = r => post({ ...r, paths: r.paths.slice(1) })
      return thread
    }, 1)
    await expect(reader.read(files.slice(0, 2))).rejects.toThrow(/wrong headers/)
    await expect(reader.stamp(files.slice(0, 2))).rejects.toThrow(/wrong stamps/)
    await reader.close()
  })
})

describe('what crosses from a reader thread', () => {
  it('[NFR-023] Given a parsed header, When sent and rebuilt, Then every keyword maps to its card without the raw text', () => {
    const parsed = parseFitsFile(files[3])
    const back = fromSent(structuredClone(toSent(parsed)))
    expect(back.isValid).toBe(true)
    expect(back.headers.map(h => [h.keyword, h.value, h.comment])).toEqual(parsed.headers.map(h => [h.keyword, h.value, h.comment]))
    expect([...back.headerMap.keys()]).toEqual([...parsed.headerMap.keys()])
    expect(back.headerMap.get('FRAME')?.value).toBe(3)
    expect(back.headers.every(h => h.raw === '')).toBe(true)
  })

  it('[NFR-024] Given a request that throws, When answered, Then the reply carries the error rather than killing the thread', async () => {
    const reply = await answerScanRead({ id: 7, op: 'stamp', paths: null as unknown as string[] })
    expect(reply).toMatchObject({ id: 7, error: expect.any(String) })
  })
})
