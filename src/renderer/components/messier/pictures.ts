import { useEffect, useState } from 'react'
import { invoke } from '../../hooks/useIPC'
import type { MessierPictureView } from '@shared/types'

/** Width of a tile's picture: sharp at eleven tiles across a wide screen, small to send. */
export const TILE_WIDTH = 192
/** Width of the picture in a tile's details. */
export const DETAIL_WIDTH = 512

/**
 * Pictures already drawn this session, by Messier number and width, so moving between pages and
 * back shows them at once. The main process keeps its own copy until the file changes (MES-012).
 */
const drawn = new Map<string, MessierPictureView>()
let queue: Promise<unknown> = Promise.resolve()
/** Moves on with each forget, so a picture asked for before it is never kept after it. */
let generation = 0

/** Asks for one picture after the one before has come back, so tiles load in order without flooding the main process. */
function fetchPicture(number: number, width: number): Promise<MessierPictureView> {
  const key = `${number}:${width}`
  if (drawn.has(key)) return Promise.resolve(drawn.get(key) ?? null)
  const asked = generation
  const run = queue.then(async () => {
    if (asked === generation && drawn.has(key)) return drawn.get(key) ?? null
    const view = await invoke<MessierPictureView>('messier:picture', { number, max_width: width })
    if (asked === generation) drawn.set(key, view)
    return view
  })
  queue = run.catch(() => undefined)
  return run
}

/** Forgets drawn pictures, for a reload after a scan. */
export function forgetPictures(): void {
  generation++
  drawn.clear()
}

/** What a tile shows while its picture loads, once drawn, or when it failed. */
export type PictureState = { status: 'none' } | { status: 'loading' } | { status: 'shown'; src: string; name: string } | { status: 'failed'; error: string }

/** The picture of a Messier object at a width; `wanted` false skips the request (the object has no image). */
export function usePicture(number: number, width: number, wanted: boolean): PictureState {
  const cached = drawn.get(`${number}:${width}`)
  const [state, setState] = useState<PictureState>(() => (wanted ? (cached !== undefined ? toState(cached) : { status: 'loading' }) : { status: 'none' }))
  useEffect(() => {
    if (!wanted) {
      setState({ status: 'none' })
      return
    }
    let live = true
    setState(prev => (prev.status === 'shown' ? prev : { status: 'loading' }))
    fetchPicture(number, width)
      .then(view => live && setState(toState(view)))
      .catch((error: unknown) => live && setState({ status: 'failed', error: error instanceof Error ? error.message : String(error) }))
    return () => {
      live = false
    }
  }, [number, width, wanted])
  return state
}

function toState(view: MessierPictureView): PictureState {
  if (!view) return { status: 'none' }
  if ('refused' in view) return { status: 'failed', error: view.refused }
  return view.ok ? { status: 'shown', src: view.src, name: view.name } : { status: 'failed', error: view.error }
}

/** The pictures of these objects at a width, drawing any not drawn yet, by Messier number; ones that fail are left out. */
export async function pictureSources(numbers: number[], width: number): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  for (const number of numbers) {
    const view = await fetchPicture(number, width).catch(() => null)
    if (view && !('refused' in view) && view.ok) out.set(number, view.src)
  }
  return out
}
