import { parentPort } from 'worker_threads'
import { answerScanRead, type ScanReadRequest } from '../fits/frame-reader'

/** Reads stamps and headers for a folder scan off the main process, one list at a time (NFR-023). */
parentPort?.on('message', async (request: ScanReadRequest) => {
  parentPort?.postMessage(await answerScanRead(request))
})
