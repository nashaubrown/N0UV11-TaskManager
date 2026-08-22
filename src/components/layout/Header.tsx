import { Bell, Menu, Moon, Search, Sun } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../common/Button'
import { Avatar } from '../common/Avatar'
import { useTheme } from '../../store/theme'
import { useUi } from '../../store/ui'
import { currentUser } from '../../mocks/data'

export function Header() {
  const { theme, toggle } = useTheme()
  const setSidebarOpen = useUi((s) => s.setSidebarOpen)

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
        <Avatar user={currentUser} size="sm" />
      </div>
    </header>
  )
}
