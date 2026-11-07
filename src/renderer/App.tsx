import React, { Suspense, useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/common/Layout'
import { ToastProvider } from './contexts/ToastContext'
import { LearningProvider } from './contexts/LearningContext'
import { CompanionLinks } from './components/companion/CompanionLinks'
import { NAV_PLACES, settingsLink } from '@shared/navigation'
import { WARM_AFTER_MS, pagesToWarm } from '@shared/page-loading'
import { ROUTES, preloadPage } from './routes'
import { Loading } from './components/ui'
import { PageLoadBoundary } from './components/common/PageLoadBoundary'

/**
 * Once Home has settled, fetches the sidebar places' pages in the background, so a first visit
 * opens at once (EUX-019).
 */
function useWarmPages(): void {
  useEffect(() => {
    const pages = pagesToWarm(window.astrorepoMode, NAV_PLACES)
    if (pages.length === 0) return
    let idle: number | undefined
    const timer = window.setTimeout(() => {
      const warm = () => pages.forEach(preloadPage)
      if (typeof window.requestIdleCallback === 'function') idle = window.requestIdleCallback(warm)
      else warm()
    }, WARM_AFTER_MS)
    return () => {
      window.clearTimeout(timer)
      if (idle !== undefined) window.cancelIdleCallback(idle)
    }
  }, [])
}

export function App(): React.ReactElement {
  useWarmPages()
  return (
    <ToastProvider>
      <LearningProvider>
        <HashRouter>
          <CompanionLinks />
          <Layout>
            <PageLoadBoundary>
              <Suspense fallback={<Loading label="Loading the page" className="p-6" />}>
                <Routes>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  {ROUTES.map(({ path, page: Page }) => <Route key={path} path={path} element={<Page />} />)}
                  <Route path="/equipment" element={<Navigate to={settingsLink('equipment')} replace />} />
                </Routes>
              </Suspense>
            </PageLoadBoundary>
          </Layout>
        </HashRouter>
      </LearningProvider>
    </ToastProvider>
  )
}
