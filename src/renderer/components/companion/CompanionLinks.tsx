import React, { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { askScreen, FOLLOW_EVERY_MS, NotPairedError, shouldMove } from '../../companion'
import { COMPANION_KEY, storedCompanionKey } from '../../bridge'

const fetchFn = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => window.fetch(url, init)

/**
 * On a companion screen: asks the PC where to be every few seconds and goes there, holding for a
 * minute after a touch (specs/035-pi-variant, PI-021).
 */
export function CompanionFollower(): null {
  const navigate = useNavigate()
  const location = useLocation()
  const current = useRef('')
  const lastTouchAt = useRef<number | null>(null)
  const previous = useRef<string | null>(null)
  useEffect(() => {
    current.current = `${location.pathname}${location.search}`
  }, [location.pathname, location.search])

  useEffect(() => {
    const touched = () => { lastTouchAt.current = Date.now() }
    window.addEventListener('pointerdown', touched)
    window.addEventListener('keydown', touched)
    const key = storedCompanionKey(window)
    const timer = window.setInterval(() => {
      askScreen(fetchFn, key)
        .then(({ screen, route }) => {
          const move = shouldMove({ current: current.current, wanted: route, screen, previous: previous.current, lastTouchAt: lastTouchAt.current, now: Date.now() })
          previous.current = route
          if (move) navigate(route)
        })
        .catch(error => {
          if (!(error instanceof NotPairedError)) return
          try {
            window.localStorage.removeItem(COMPANION_KEY)
          } catch {
            // Nothing kept, nothing to forget.
          }
          window.location.reload()
        })
    }, FOLLOW_EVERY_MS)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('pointerdown', touched)
      window.removeEventListener('keydown', touched)
    }
  }, [navigate])

  return null
}

/** In the desktop app: tells companions that follow this PC which page it is on (PI-021). */
export function PcRouteReporter(): null {
  const location = useLocation()
  useEffect(() => {
    window.api.invoke('companion:report-route', { route: `${location.pathname}${location.search}` }).catch(() => undefined)
  }, [location.pathname, location.search])
  return null
}

/** The companion side of the app: following on a companion screen, reporting in the desktop app. */
export function CompanionLinks(): React.ReactElement | null {
  if (window.astrorepoMode === 'companion') return <CompanionFollower />
  if (window.astrorepoMode === 'desktop') return <PcRouteReporter />
  return null
}
