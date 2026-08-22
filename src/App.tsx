import { lazy, Suspense } from 'react'
import { BrowserRouter, HashRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './services/queryClient'
import { AppShell } from './components/layout/AppShell'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Projects = lazy(() => import('./pages/Projects'))
const ProjectView = lazy(() => import('./pages/ProjectView'))
const Tasks = lazy(() => import('./pages/Tasks'))
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

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Suspense fallback={<PageFallback />}><Dashboard /></Suspense>} />
            <Route path="projects" element={<Suspense fallback={<PageFallback />}><Projects /></Suspense>} />
            <Route path="projects/:projectId" element={<Suspense fallback={<PageFallback />}><ProjectView /></Suspense>} />
            <Route path="tasks" element={<Suspense fallback={<PageFallback />}><Tasks /></Suspense>} />
            <Route path="photos" element={<Suspense fallback={<PageFallback />}><PhotoLibrary /></Suspense>} />
            <Route path="deals" element={<Suspense fallback={<PageFallback />}><Deals /></Suspense>} />
            <Route path="styleguide" element={<Suspense fallback={<PageFallback />}><Styleguide /></Suspense>} />
          </Route>
        </Routes>
      </Router>
    </QueryClientProvider>
  )
}
