import React, { lazy, Suspense } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/common/Layout'
import { Dashboard } from './pages/Dashboard'
import { ToastProvider } from './contexts/ToastContext'
import { LearningProvider } from './contexts/LearningContext'
import { CompanionLinks } from './components/companion/CompanionLinks'
import { settingsLink } from '@shared/navigation'
import { Loading } from './components/ui'

/**
 * Every page but Home is loaded the first time it is opened (specs/045-developer-experience, D6),
 * so the app starts on Home without reading every page's code first.
 */
function page<K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K): React.LazyExoticComponent<React.ComponentType> {
  return lazy(() => load().then(m => ({ default: m[name] })))
}

const TargetList = page(() => import('./pages/TargetList'), 'TargetList')
const TargetDetail = page(() => import('./pages/TargetDetail'), 'TargetDetail')
const SessionForm = page(() => import('./pages/SessionForm'), 'SessionForm')
const Collections = page(() => import('./pages/Collections'), 'Collections')
const CollectionDetail = page(() => import('./pages/CollectionDetail'), 'CollectionDetail')
const Images = page(() => import('./pages/Images'), 'Images')
const Library = page(() => import('./pages/Library'), 'Library')
const Poster = page(() => import('./pages/Poster'), 'Poster')
const MessierMosaic = page(() => import('./pages/MessierMosaic'), 'MessierMosaic')
const MosaicWorkspaces = page(() => import('./pages/MosaicWorkspaces'), 'MosaicWorkspaces')
const Projects = page(() => import('./pages/Projects'), 'Projects')
const ProjectDetail = page(() => import('./pages/Project'), 'ProjectDetail')
const MosaicWorkspaceDetail = page(() => import('./pages/MosaicWorkspace'), 'MosaicWorkspaceDetail')
const Settings = page(() => import('./pages/Settings'), 'Settings')
const Jobs = page(() => import('./pages/Jobs'), 'Jobs')
const Vespera = page(() => import('./pages/Vespera'), 'Vespera')
const FitsAnalyzer = page(() => import('./pages/FitsAnalyzer'), 'FitsAnalyzer')
const StorageAnalytics = page(() => import('./pages/StorageAnalytics'), 'StorageAnalytics')
const Calibration = page(() => import('./pages/Calibration'), 'Calibration')
const StackingAnalysis = page(() => import('./pages/StackingAnalysis'), 'StackingAnalysis')
const Insights = page(() => import('./pages/Insights'), 'Insights')
const Learn = page(() => import('./pages/Learn'), 'Learn')
const SkyPlanner = page(() => import('./pages/SkyPlanner'), 'SkyPlanner')
const SessionTimeline = page(() => import('./pages/SessionTimeline'), 'SessionTimeline')

export function App(): React.ReactElement {
  return (
    <ToastProvider>
      <LearningProvider>
        <HashRouter>
          <CompanionLinks />
          <Layout>
            <Suspense fallback={<Loading label="Loading the page" className="p-6" />}>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/targets" element={<TargetList />} />
                <Route path="/targets/:id" element={<TargetDetail />} />
                <Route path="/sessions/new" element={<SessionForm />} />
                <Route path="/sessions/:id/edit" element={<SessionForm />} />
                <Route path="/collections" element={<Collections />} />
                <Route path="/collections/:id" element={<CollectionDetail />} />
                <Route path="/equipment" element={<Navigate to={settingsLink('equipment')} replace />} />
                <Route path="/library" element={<Library />} />
                <Route path="/images" element={<Images />} />
                <Route path="/fits-analyzer" element={<FitsAnalyzer />} />
                <Route path="/stacking" element={<StackingAnalysis />} />
                <Route path="/insights" element={<Insights />} />
                <Route path="/learn" element={<Learn />} />
                <Route path="/sky-planner" element={<SkyPlanner />} />
                <Route path="/analytics" element={<StorageAnalytics />} />
                <Route path="/calibration" element={<Calibration />} />
                <Route path="/timeline" element={<SessionTimeline />} />
                <Route path="/poster" element={<Poster />} />
                <Route path="/projects" element={<Projects />} />
                <Route path="/projects/:id" element={<ProjectDetail />} />
                <Route path="/mosaics" element={<MosaicWorkspaces />} />
                <Route path="/mosaics/:id" element={<MosaicWorkspaceDetail />} />
                <Route path="/messier" element={<MessierMosaic />} />
                <Route path="/jobs" element={<Jobs />} />
                <Route path="/vespera" element={<Vespera />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </Suspense>
          </Layout>
        </HashRouter>
      </LearningProvider>
    </ToastProvider>
  )
}
