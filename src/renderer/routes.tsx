import React, { lazy, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { NAV_PLACES } from '@shared/navigation'
import { WARM_AFTER_MS, pagesToWarm, routeFor } from '@shared/page-loading'
import { Dashboard } from './pages/Dashboard'

/** A page loaded the first time it is opened, which can also be fetched ahead (spec 046, U6). */
type LazyPage = React.LazyExoticComponent<React.ComponentType> & { preload: () => Promise<unknown> }

/**
 * Every page but Home is loaded the first time it is opened (specs/045-developer-experience, D6),
 * so the app starts on Home without reading every page's code first. `preload` fetches it ahead.
 */
function page<K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K): LazyPage {
  return Object.assign(lazy(() => load().then(m => ({ default: m[name] }))), { preload: load })
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

/** Every page by its route, in the order they are matched. */
export const ROUTES: ReadonlyArray<{ path: string; page: React.ComponentType | LazyPage }> = [
  { path: '/dashboard', page: Dashboard },
  { path: '/targets', page: TargetList },
  { path: '/targets/:id', page: TargetDetail },
  { path: '/sessions/new', page: SessionForm },
  { path: '/sessions/:id/edit', page: SessionForm },
  { path: '/collections', page: Collections },
  { path: '/collections/:id', page: CollectionDetail },
  { path: '/library', page: Library },
  { path: '/images', page: Images },
  { path: '/fits-analyzer', page: FitsAnalyzer },
  { path: '/stacking', page: StackingAnalysis },
  { path: '/insights', page: Insights },
  { path: '/learn', page: Learn },
  { path: '/sky-planner', page: SkyPlanner },
  { path: '/analytics', page: StorageAnalytics },
  { path: '/calibration', page: Calibration },
  { path: '/timeline', page: SessionTimeline },
  { path: '/poster', page: Poster },
  { path: '/projects', page: Projects },
  { path: '/projects/:id', page: ProjectDetail },
  { path: '/mosaics', page: MosaicWorkspaces },
  { path: '/mosaics/:id', page: MosaicWorkspaceDetail },
  { path: '/messier', page: MessierMosaic },
  { path: '/jobs', page: Jobs },
  { path: '/vespera', page: Vespera },
  { path: '/settings', page: Settings }
]

const fetched = new Set<string>()

/**
 * Starts fetching the code of the page a link opens (EUX-018), once; a failure is left for the
 * page itself to report when it is opened.
 */
export function preloadPage(to: string): void {
  const path = routeFor(ROUTES.map(r => r.path), to)
  const route = ROUTES.find(r => r.path === path)
  if (!route || !('preload' in route.page) || fetched.has(route.path)) return
  fetched.add(route.path)
  route.page.preload().catch(() => fetched.delete(route.path))
}

/**
 * While Home is open and the app is idle, fetches the sidebar places' pages in the background, so
 * a first visit opens at once (EUX-019). Leaving Home before then cancels it, so the page chosen
 * loads on its own; coming back to Home starts the wait again for any not yet fetched.
 */
export function WarmPages(): null {
  const { pathname } = useLocation()
  const onHome = pathname === '/dashboard'
  useEffect(() => {
    const pages = onHome ? pagesToWarm(window.astrorepoMode, NAV_PLACES) : []
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
  }, [onHome])
  return null
}
