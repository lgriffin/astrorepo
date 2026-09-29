import type { Clock } from '@astro/application'

/** A clock that reads whatever the test set it to. */
export class FixedClock implements Clock {
  constructor(private current: Date = new Date('2026-09-29T12:00:00Z')) {}

  now(): Date {
    return new Date(this.current)
  }

  set(iso: string): void {
    this.current = new Date(iso)
  }
}
