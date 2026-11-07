import React from 'react'
import { useLocation } from 'react-router-dom'
import { Button } from '../ui'

interface State {
  failed: boolean
}

/**
 * Catches a page that could not be loaded or drawn (spec 045, DEV-023), such as a companion screen
 * that lost the PC or a page from an older build, and offers a reload in place of a blank screen.
 */
class Boundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: unknown): void {
    console.error('The page could not be shown:', error)
  }

  render(): React.ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className="m-6 space-y-3 rounded border border-astro-border bg-astro-surface p-4 text-sm text-astro-text">
        <p>This page could not be loaded. If the app was updated or the PC went away, reloading fetches it again.</p>
        {/* A failed page load is kept by React, so only a reload tries it again. */}
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </div>
    )
  }
}

/** The boundary, started afresh on each page, so moving to another page leaves the failure behind. */
export function PageLoadBoundary({ children }: { children: React.ReactNode }): React.ReactElement {
  const { pathname } = useLocation()
  return <Boundary key={pathname}>{children}</Boundary>
}
