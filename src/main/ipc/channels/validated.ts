import type { z } from 'zod'
import { schemas, type Channel, type SchemaMap } from '../schemas'
import type { ChannelHandler } from '../../transport/router'

/** Puts one channel on the router. */
export type Handle = (channel: string, handler: ChannelHandler) => void

/** A handler that checks its arguments against the channel's schema before it runs (PI-001). */
export function validated<C extends Channel>(channel: C, handler: (args: z.infer<SchemaMap[C]>) => unknown): ChannelHandler {
  return async (rawArgs: unknown) => {
    const args = schemas[channel].parse(rawArgs) as z.infer<SchemaMap[C]>
    return handler(args)
  }
}
