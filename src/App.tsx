import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, HashRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './services/queryClient'
import { AppShell } from './components/layout/AppShell'
import { useAuth } from './store/auth'
import { useData } from './store/data'
import { connectRealtime, disconnectRealtime } from './services/ws'
import { DEMO } from './services/api'
import Login from './pages/Login'
import Portal from './pages/Portal'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Projects = lazy(() => import('./pages/Projects'))
const ProjectView = lazy(() => import('./pages/ProjectView'))
const Tasks = lazy(() => import('./pages/Tasks'))
const Calendar = lazy(() => import('./pages/Calendar'))
const PhotoLibrary = lazy(() => import('./pages/PhotoLibrary'))
const Deals = lazy(() => import('./pages/Deals'))
const Styleguide = lazy(() => import('./pages/Styleguide'))

function PageFallback() {
  return (
    <div className="flex items-center justify-center py-24" role="status" aria-label="Loading">
      <span className="size-8 rounded-full border-2 border-border border-t-(--nv-coral) animate-spin" />
    </div>
  )
}

// Single-file preview builds have no server-side routing — use hash URLs there.
const Router = import.meta.env.MODE === 'artifact' ? HashRouter : BrowserRouter

function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Suspense fallback={<PageFallback />}><Dashboard /></Suspense>} />
        <Route path="projects" element={<Suspense fallback={<PageFallback />}><Projects /></Suspense>} />
        <Route path="projects/:projectId" element={<Suspense fallback={<PageFallback />}><ProjectView /></Suspense>} />
        <Route path="tasks" element={<Suspense fallback={<PageFallback />}><Tasks /></Suspense>} />
        <Route path="calendar" element={<Suspense fallback={<PageFallback />}><Calendar /></Suspense>} />
        <Route path="photos" element={<Suspense fallback={<PageFallback />}><PhotoLibrary /></Suspense>} />
        <Route path="deals" element={<Suspense fallback={<PageFallback />}><Deals /></Suspense>} />
        <Route path="styleguide" element={<Suspense fallback={<PageFallback />}><Styleguide /></Suspense>} />
      </Route>
    </Routes>
  )
}

function Gate() {
  const { ready, user, init } = useAuth()
  // the client portal is public — no login, its own data fetching
  const portalMatch = window.location.pathname.match(/^\/portal\/([^/]+)/) ??
    window.location.hash.match(/^#\/portal\/([^/]+)/)
  const hydrate = useData((s) => s.hydrate)

  useEffect(() => { void init() }, [init])

  useEffect(() => {
    if (DEMO || user) {
      void hydrate()
      connectRealtime()
      const flush = () => void useData.getState().flushOfflineUploads()
      flush() // retry anything queued while offline last session
      window.addEventListener('online', flush)
      return () => {
        window.removeEventListener('online', flush)
        disconnectRealtime()
      }
    }
  }, [user, hydrate])

  if (portalMatch) return <Portal token={decodeURIComponent(portalMatch[1])} />
  if (!DEMO && !ready) return <PageFallback />
  if (!DEMO && !user) return <Login />
  return <AppRoutes />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Gate />
      </Router>
    </QueryClientProvider>
  )
}
