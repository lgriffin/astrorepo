import type { Clock } from '@astro/application'

export const systemClock: Clock = { now: () => new Date() }
