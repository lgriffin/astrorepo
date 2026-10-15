/** Answers one request: the arguments exactly as the renderer sent them. */
export type ChannelHandler = (...args: unknown[]) => unknown

/**
 * Every request the renderer can make, by channel name (specs/035-pi-variant). It holds no
 * Electron types, so the desktop app hosts it over IPC and a headless server can host the same
 * handlers over HTTP (PI-001).
 */
export class ChannelRouter {
  private readonly handlers = new Map<string, ChannelHandler>()

  /** Adds a channel; a name taken twice is a mistake in the code, so it throws (PI-003). */
  handle(channel: string, handler: ChannelHandler): void {
    if (this.handlers.has(channel)) throw new Error(`The channel "${channel}" is already handled.`)
    this.handlers.set(channel, handler)
  }

  /** The channels in the order they were added. */
  channels(): string[] {
    return [...this.handlers.keys()]
  }

  has(channel: string): boolean {
    return this.handlers.has(channel)
  }

  /** Runs a channel's handler; a channel nobody handles is refused with its name (PI-002). */
  async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    const handler = this.handlers.get(channel)
    if (!handler) throw new Error(`No handler for the channel "${channel}".`)
    return handler(...args)
  }
}
