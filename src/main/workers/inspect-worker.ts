import { parentPort } from 'worker_threads'
import { answerPixels, serialQueue, type PixelsRequest } from '../adapters/node-image-pixels'

/**
 * Reads images for the inspector off the main process, one request at a time (NFR-019): requests
 * that arrive together wait their turn, so only one full frame is decoded at once. Only the
 * statistics and the small preview go back; the preview's bytes are handed over, not copied.
 */
const queue = serialQueue()
parentPort?.on('message', (request: PixelsRequest) => {
  void queue(() => answerPixels(request)).then(({ reply, transfer }) => parentPort?.postMessage(reply, transfer))
})
