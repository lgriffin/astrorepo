import { parentPort } from 'worker_threads'
import { measureFitsFile } from '../fits/measure-fits'
import type { MeasureReply, MeasureRequest } from '../adapters/node-frame-measurer'

/** Measures lights off the main process, one request at a time, so the app stays responsive (NFR-014). */
parentPort?.on('message', async ({ id, path }: MeasureRequest) => {
  let reply: MeasureReply
  try {
    reply = { id, measurement: await measureFitsFile(path) }
  } catch (error) {
    reply = { id, error: error instanceof Error ? error.message : String(error) }
  }
  parentPort?.postMessage(reply)
})
