import React from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/common/Layout'
import { Dashboard } from './pages/Dashboard'
import { TargetList } from './pages/TargetList'
import { TargetDetail } from './pages/TargetDetail'
import { SessionForm } from './pages/SessionForm'
import { Collections } from './pages/Collections'
import { CollectionDetail } from './pages/CollectionDetail'
import { Equipment } from './pages/Equipment'
import { Images } from './pages/Images'
import { Library } from './pages/Library'
import { Poster } from './pages/Poster'
import { Settings } from './pages/Settings'
import { FitsAnalyzer } from './pages/FitsAnalyzer'
import { StorageAnalytics } from './pages/StorageAnalytics'
import { Calibration } from './pages/Calibration'
import { StackingAnalysis } from './pages/StackingAnalysis'
import { Insights } from './pages/Insights'
import { SkyPlanner } from './pages/SkyPlanner'
import { SessionTimeline } from './pages/SessionTimeline'
import { ToastProvider } from './contexts/ToastContext'

export function App(): React.ReactElement {
  return (
    <ToastProvider>
      <HashRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/targets" element={<TargetList />} />
            <Route path="/targets/:id" element={<TargetDetail />} />
            <Route path="/sessions/new" element={<SessionForm />} />
            <Route path="/sessions/:id/edit" element={<SessionForm />} />
            <Route path="/collections" element={<Collections />} />
            <Route path="/collections/:id" element={<CollectionDetail />} />
            <Route path="/equipment" element={<Equipment />} />
            <Route path="/library" element={<Library />} />
            <Route path="/images" element={<Images />} />
            <Route path="/fits-analyzer" element={<FitsAnalyzer />} />
            <Route path="/stacking" element={<StackingAnalysis />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/sky-planner" element={<SkyPlanner />} />
            <Route path="/analytics" element={<StorageAnalytics />} />
            <Route path="/calibration" element={<Calibration />} />
            <Route path="/timeline" element={<SessionTimeline />} />
            <Route path="/poster" element={<Poster />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Layout>
      </HashRouter>
    </ToastProvider>
  )
}
