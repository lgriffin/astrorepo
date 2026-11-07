import { isValidSite } from '@astro/domain'
import type { SiteWriter } from '../ports/sky'

export type SaveSite = (latitudeDeg: number, longitudeDeg: number) => Promise<{ saved: true }>

/**
 * Saves the site's latitude and longitude as one change (specs/046-everyday-ux, EUX-001, EUX-003):
 * a site out of range is refused and nothing is written.
 */
export function makeSaveSite(deps: { writer: SiteWriter }): SaveSite {
  return async (latitudeDeg, longitudeDeg) => {
    if (!isValidSite({ latitudeDeg, longitudeDeg, elevationM: 0 })) {
      throw new Error('Latitude runs from -90 to 90 and longitude from -180 to 180.')
    }
    await deps.writer.saveLocation(latitudeDeg, longitudeDeg)
    return { saved: true }
  }
}
