import { create } from 'zustand'
import type { Capability, User } from '../types'
import { CAPABILITIES } from '../types'
import { api, DEMO, setTokens, getAccessToken } from '../services/api'
import { currentUser as demoUser } from '../mocks/data'

interface AuthState {
  user?: User
  capabilities: Capability[]
  organizationName?: string
  role?: string
  ready: boolean
  busy: boolean
  error?: string
  init: () => Promise<void>
  login: (email: string, password: string) => Promise<boolean>
  signup: (input: { email: string; password: string; fullName: string; organizationName: string }) => Promise<boolean>
  logout: () => void
}

interface SessionResponse {
  user: User
  organization?: { name: string }
  role: string
  accessToken: string
  refreshToken: string
}

export const useAuth = create<AuthState>((set) => {
  const acceptSession = (data: SessionResponse) => {
    setTokens(data.accessToken, data.refreshToken)
    set({ user: data.user, organizationName: data.organization?.name, role: data.role, busy: false, error: undefined })
    // capabilities arrive via /auth/me (owner defaults apply for fresh signups)
    void api<{ capabilities?: Capability[] }>('GET', '/auth/me')
      .then((me) => set({ capabilities: me.capabilities ?? [] }))
      .catch(() => set({ capabilities: [] }))
    return true
  }
  const fail = (e: unknown) => {
    set({ busy: false, error: e instanceof Error ? e.message : 'Something went wrong' })
    return false
  }

  return {
    ready: false,
    busy: false,
    capabilities: [],

    init: async () => {
      if (DEMO) return set({ user: demoUser, role: 'owner', organizationName: 'NOUVII Studio', capabilities: [...CAPABILITIES], ready: true })
      if (!getAccessToken()) return set({ ready: true })
      try {
        const me = await api<{ user: User; role: string; capabilities?: Capability[] }>('GET', '/auth/me')
        set({ user: me.user, role: me.role, capabilities: me.capabilities ?? [], ready: true })
      } catch {
        setTokens(null, null)
        set({ ready: true })
      }
    },

    login: async (email, password) => {
      set({ busy: true, error: undefined })
      try {
        return acceptSession(await api<SessionResponse>('POST', '/auth/login', { email, password }))
      } catch (e) {
        return fail(e)
      }
    },

    signup: async (input) => {
      set({ busy: true, error: undefined })
      try {
        return acceptSession(await api<SessionResponse>('POST', '/auth/signup', input))
      } catch (e) {
        return fail(e)
      }
    },

    logout: () => {
      setTokens(null, null)
      set({ user: undefined, role: undefined, organizationName: undefined })
    },
  }
})
