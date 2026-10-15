import { ipcMain } from 'electron'
import type { ChannelRouter } from '../transport/router'

/** Hosts every channel of the router over Electron IPC, as the preload's api.invoke expects (PI-001). */
export function hostOverIpc(router: ChannelRouter): void {
  for (const channel of router.channels()) {
    ipcMain.handle(channel, (_event, ...args: unknown[]) => router.invoke(channel, ...args))
  }
}
