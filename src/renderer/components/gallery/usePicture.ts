import { useEffect, useState } from 'react'
import { invoke } from '../../hooks/useIPC'
import type { GalleryPictureData } from '@shared/types'

export type PictureState = { status: 'loading' } | { status: 'ready'; src: string } | { status: 'failed'; error: string }

/**
 * A gallery picture shrunk to `width` by the main process (NFR-021), loaded once `wanted` is true.
 * An answer for a picture the caller has moved on from is dropped.
 */
export function usePicture(path: string, width: number, wanted = true): PictureState {
  const [state, setState] = useState<PictureState>({ status: 'loading' })
  useEffect(() => {
    if (!wanted) return
    let current = true
    setState({ status: 'loading' })
    invoke<GalleryPictureData | { refused: string }>('gallery:picture', { path, max_width: width })
      .then(result => {
        if (!current) return
        if ('refused' in result) setState({ status: 'failed', error: result.refused })
        else if (result.ok) setState({ status: 'ready', src: result.src })
        else setState({ status: 'failed', error: result.error })
      })
      .catch(error => current && setState({ status: 'failed', error: error instanceof Error ? error.message : String(error) }))
    return () => {
      current = false
    }
  }, [path, width, wanted])
  return state
}
