import { create } from 'zustand'

type Theme = 'light' | 'dark'

const stored = ((): Theme | null => {
  try { return localStorage.getItem('nv-theme') as Theme | null } catch { return null }
})()

const system: Theme =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark' : 'light'

const initial = stored ?? system

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#131212' : '#F9F8F7')
}
apply(initial)

interface ThemeState {
  theme: Theme
  toggle: () => void
  set: (t: Theme) => void
}

export const useTheme = create<ThemeState>((set) => ({
  theme: initial,
  set: (theme) => {
    apply(theme)
    try { localStorage.setItem('nv-theme', theme) } catch { /* private mode */ }
    set({ theme })
  },
  toggle: () => set((s) => {
    const next = s.theme === 'light' ? 'dark' : 'light'
    apply(next)
    try { localStorage.setItem('nv-theme', next) } catch { /* private mode */ }
    return { theme: next }
  }),
}))
