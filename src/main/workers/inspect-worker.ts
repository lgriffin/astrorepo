import { parentPort } from 'worker_threads'
import { inspectPath, previewPath } from '../fits/inspect-image'
import type { PixelsReply, PixelsRequest } from '../adapters/node-image-pixels'

/**
 * Reads images for the inspector off the main process, one request at a time (NFR-019). Only the
 * statistics and the small preview go back; the preview's bytes are handed over, not copied.
 */
parentPort?.on('message', async (request: PixelsRequest) => {
  let reply: PixelsReply
  const transfer: ArrayBuffer[] = []
  try {
    if (request.op === 'inspect') reply = { id: request.id, inspection: await inspectPath(request.path) }
    else {
      const { preview, header } = await previewPath(request.path, { maxWidth: request.maxWidth, channel: request.channel })
      transfer.push(preview.data.buffer as ArrayBuffer)
      reply = { id: request.id, preview, header }
    }
  } catch (error) {
    reply = { id: request.id, error: error instanceof Error ? error.message : String(error) }
  }
  parentPort?.postMessage(reply, transfer)
})
