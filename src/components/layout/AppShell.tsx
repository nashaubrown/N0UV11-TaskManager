import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { MobileTabBar, Sidebar } from './Sidebar'

export function AppShell() {
  return (
    <div className="h-full flex flex-col">
      <Header />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 overflow-y-auto pb-24 desktop:pb-8">
          <div className="mx-auto max-w-6xl px-4 tablet:px-6 py-6">
            <Outlet />
          </div>
        </main>
      </div>
      <MobileTabBar />
    </div>
  )
}
