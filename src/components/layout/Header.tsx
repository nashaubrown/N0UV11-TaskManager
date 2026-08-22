import { useEffect, useState } from 'react'
import { Bell, BellRing, LogOut, Menu, Moon, Search, Sun } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../common/Button'
import { Avatar } from '../common/Avatar'
import { useTheme } from '../../store/theme'
import { useUi } from '../../store/ui'
import { useAuth } from '../../store/auth'
import { DEMO } from '../../services/api'
import { currentSubscription, disablePush, enablePush, pushSupported } from '../../services/push'

export function Header() {
  const { theme, toggle } = useTheme()
  const setSidebarOpen = useUi((s) => s.setSidebarOpen)
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [pushState, setPushState] = useState<'unsupported' | 'off' | 'on'>('unsupported')

  useEffect(() => {
    void (async () => {
      if (!(await pushSupported())) return
      setPushState((await currentSubscription()) ? 'on' : 'off')
    })()
  }, [])

  const togglePush = async () => {
    if (pushState === 'on') {
      await disablePush()
      setPushState('off')
    } else if (pushState === 'off') {
      const ok = await enablePush().catch(() => false)
      setPushState(ok ? 'on' : 'off')
    }
  }

  return (
    <header className="sticky top-0 z-30 h-14 bg-surface/90 backdrop-blur border-b border-border flex items-center gap-3 px-4">
      <Button
        variant="ghost" size="sm" className="desktop:hidden"
        aria-label="Open menu" onClick={() => setSidebarOpen(true)}
        icon={<Menu className="size-5" />}
      />
      <Link to="/" className="font-display font-bold text-xl nv-gradient-text shrink-0">
        NOUVII
      </Link>

      <div className="flex-1 max-w-md mx-auto hidden tablet:block">
        <label className="relative block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-faint" aria-hidden />
          <input
            type="search"
            placeholder="Search tasks, photos, deals…"
            className="w-full h-9 rounded-full bg-surface-2 border border-transparent focus:border-brand focus:bg-surface
                       pl-9 pr-4 text-sm text-ink placeholder:text-ink-faint outline-none transition-colors"
          />
        </label>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <Button
          variant="ghost" size="sm" onClick={toggle}
          aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
          icon={theme === 'light' ? <Moon className="size-4.5" /> : <Sun className="size-4.5" />}
        />
        <Button variant="ghost" size="sm" aria-label="Notifications" className="relative"
          icon={<>
            <Bell className="size-4.5" />
            <span className="absolute top-1 right-1 size-2 rounded-full nv-gradient" aria-hidden />
          </>}
        />
        {user && (
          <div className="relative">
            <button
              aria-label="Account menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
              className="rounded-full focus-visible:outline-2 focus-visible:outline-brand"
            >
              <Avatar user={user} size="sm" />
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-full mt-2 w-48 rounded-(--nv-radius-md) border border-border bg-surface shadow-lg p-1.5 z-50"
                onMouseLeave={() => setMenuOpen(false)}
              >
                <p className="px-2.5 py-1.5 text-sm">
                  <span className="block font-medium text-ink truncate">{user.fullName}</span>
                  <span className="block text-xs text-ink-muted truncate">{user.email}</span>
                </p>
                {pushState !== 'unsupported' && (
                  <button
                    onClick={() => void togglePush()}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-(--nv-radius-sm) text-sm text-ink-2 hover:bg-surface-2 transition-colors"
                  >
                    {pushState === 'on'
                      ? <><BellRing className="size-4 text-success" aria-hidden /> Notifications on</>
                      : <><Bell className="size-4" aria-hidden /> Enable notifications</>}
                  </button>
                )}
                {!DEMO && (
                  <button
                    onClick={logout}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-(--nv-radius-sm) text-sm text-ink-2 hover:bg-surface-2 transition-colors"
                  >
                    <LogOut className="size-4" aria-hidden /> Log out
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
