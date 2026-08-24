import { Outlet, useLocation } from 'react-router-dom'
import clsx from 'clsx'
import { Header } from './Header'
import { MobileTabBar, Sidebar } from './Sidebar'

/** Wide, tool-like pages get the full viewport; content pages stay centered. */
const FULL_WIDTH = ['/photos', '/projects']

export function AppShell() {
  const { pathname } = useLocation()
  const fullWidth = FULL_WIDTH.some((p) => pathname === p || pathname.startsWith(`${p}?`))
  return (
    <div className="h-full flex flex-col">
      <Header />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 overflow-y-auto pb-24 desktop:pb-8">
          <div className={clsx('mx-auto px-4 tablet:px-6 py-6', fullWidth ? 'max-w-none' : 'max-w-6xl')}>
            <Outlet />
          </div>
        </main>
      </div>
      <MobileTabBar />
    </div>
  )
}
