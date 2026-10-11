import { frameKind, type FrameKind } from '@astro/domain'

/** The legacy services' name for the domain's frameKind, so every part of the app reads IMAGETYP alike. */
export function normalizeImageType(raw: string | null): FrameKind {
  return frameKind(raw)
}
