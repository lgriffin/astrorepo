import type { ChannelHandler, ChannelRouter } from '../transport/router'
import type { Desktop } from '../transport/desktop'
import { registerTargetsChannels } from './channels/targets'
import { registerSessionsChannels } from './channels/sessions'
import { registerSettingsChannels } from './channels/settings'
import { registerGalleryChannels } from './channels/gallery'
import { registerInsightsChannels } from './channels/insights'
import { registerFitsChannels } from './channels/fits'
import { registerLibraryChannels } from './channels/library'
import { registerVesperaChannels } from './channels/vespera'
import { registerSkyChannels } from './channels/sky'
import { registerWorkspacesChannels } from './channels/workspaces'

export { validated } from './channels/validated'

/**
 * Puts every channel the renderer can call on the router; the machine's own pickers and shell come
 * from `desktop`. Each area's channels are in its own module under ./channels (spec 045, D6).
 */
export function registerHandlers(router: ChannelRouter, desktop: Desktop): void {
  const handle = (channel: string, handler: ChannelHandler) => router.handle(channel, handler)
  registerTargetsChannels(handle)
  registerSessionsChannels(handle, desktop)
  registerSettingsChannels(handle, desktop)
  registerGalleryChannels(handle, desktop)
  registerInsightsChannels(handle)
  registerFitsChannels(handle, desktop)
  registerLibraryChannels(handle, desktop)
  registerVesperaChannels(handle)
  registerSkyChannels(handle, desktop)
  registerWorkspacesChannels(handle, desktop)
}
