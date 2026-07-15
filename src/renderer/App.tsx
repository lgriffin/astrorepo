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
import { Observatory } from './pages/Observatory'
import { Planning } from './pages/Planning'
import { Poster } from './pages/Poster'
import { Settings } from './pages/Settings'
import { FitsAnalyzer } from './pages/FitsAnalyzer'

export function App(): React.ReactElement {
  return (
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
          <Route path="/observatory" element={<Observatory />} />
          <Route path="/planning" element={<Planning />} />
          <Route path="/fits-analyzer" element={<FitsAnalyzer />} />
          <Route path="/poster" element={<Poster />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
    </HashRouter>
  )
}
