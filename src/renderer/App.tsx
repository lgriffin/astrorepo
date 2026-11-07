import React, { Suspense } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/common/Layout'
import { ToastProvider } from './contexts/ToastContext'
import { LearningProvider } from './contexts/LearningContext'
import { CompanionLinks } from './components/companion/CompanionLinks'
import { settingsLink } from '@shared/navigation'
import { ROUTES, WarmPages } from './routes'
import { Loading } from './components/ui'
import { PageLoadBoundary } from './components/common/PageLoadBoundary'

export function App(): React.ReactElement {
  return (
    <ToastProvider>
      <LearningProvider>
        <HashRouter>
          <CompanionLinks />
          <WarmPages />
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
