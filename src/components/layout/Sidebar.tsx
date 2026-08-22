import { NavLink } from 'react-router-dom'
import { CalendarDays, CheckSquare, FolderKanban, Handshake, Image, LayoutDashboard, Palette, Store } from 'lucide-react'
import clsx from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import { useUi } from '../../store/ui'
import { useIsDesktop } from '../../hooks/useMediaQuery'

export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/photos', label: 'Photo Library', icon: Image },
  { to: '/merchants', label: 'Merchants', icon: Store },
  { to: '/deals', label: 'Deals', icon: Handshake },
  { to: '/styleguide', label: 'Styleguide', icon: Palette },
]

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1 p-3" aria-label="Primary">
      {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-3 rounded-(--nv-radius-md) px-3 py-2.5 text-sm font-medium transition-colors',
              isActive
                ? 'nv-gradient text-on-brand shadow-sm'
                : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
            )
          }
        >
          <Icon className="size-4.5 shrink-0" aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

export function Sidebar() {
  const isDesktop = useIsDesktop()
  const { sidebarOpen, setSidebarOpen } = useUi()

  if (isDesktop) {
    return (
      <aside className="w-60 shrink-0 border-r border-border bg-surface hidden desktop:flex flex-col">
        <NavList />
        <div className="mt-auto p-4 text-xs text-ink-faint">NOUVII · Phase 1</div>
      </aside>
    )
  }

  return (
    <AnimatePresence>
      {sidebarOpen && (
        <motion.div className="fixed inset-0 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} aria-hidden />
          <motion.aside
            initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="absolute inset-y-0 left-0 w-64 bg-surface border-r border-border shadow-xl"
          >
            <div className="px-5 py-4 border-b border-border">
              <span className="font-display font-bold text-lg nv-gradient-text">NOUVII</span>
            </div>
            <NavList onNavigate={() => setSidebarOpen(false)} />
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Bottom tab bar — primary nav on phones (PWA-friendly thumb reach). */
export function MobileTabBar() {
  const items = NAV_ITEMS.slice(0, 5)
  return (
    <nav
      aria-label="Primary"
      className="desktop:hidden fixed bottom-0 inset-x-0 z-30 bg-surface/95 backdrop-blur border-t border-border
                 flex justify-around pb-[env(safe-area-inset-bottom)]"
    >
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            clsx(
              'flex flex-col items-center gap-0.5 px-3 py-2 text-[10px] font-medium min-w-16',
              isActive ? 'text-brand-deep dark:text-brand' : 'text-ink-faint',
            )
          }
        >
          <Icon className="size-5" aria-hidden />
          {label.split(' ')[0]}
        </NavLink>
      ))}
    </nav>
  )
}
