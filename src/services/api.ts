/** HTTP client for the NOUVII API: token storage, single-flight refresh,
 *  and a typed request helper. Demo builds never import network state. */

/** Demo mode: the single-file artifact build, an explicit VITE_DEMO=1, or a
 *  hosted production build with no API configured (e.g. a Vercel preview
 *  before the backend exists) — the app then runs on in-memory demo data. */
export const DEMO =
  import.meta.env.MODE === 'artifact' ||
  import.meta.env.VITE_DEMO === '1' ||
  (import.meta.env.PROD &&
    !import.meta.env.VITE_API_URL &&
    typeof window !== 'undefined' &&
    !['localhost', '127.0.0.1'].includes(window.location.hostname))

const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api'
export const apiOrigin = API_URL.replace(/\/api\/?$/, '')

const KEYS = { access: 'nv.access', refresh: 'nv.refresh' }

let accessToken: string | null = null
try { accessToken = localStorage.getItem(KEYS.access) } catch { /* storage unavailable */ }

export const getAccessToken = () => accessToken

export function setTokens(access: string | null, refresh?: string | null) {
  accessToken = access
  try {
    if (access) localStorage.setItem(KEYS.access, access)
    else localStorage.removeItem(KEYS.access)
    if (refresh !== undefined) {
      if (refresh) localStorage.setItem(KEYS.refresh, refresh)
      else localStorage.removeItem(KEYS.refresh)
    }
  } catch { /* storage unavailable */ }
}

const getRefreshToken = () => {
  try { return localStorage.getItem(KEYS.refresh) } catch { return null }
}

export class ApiError extends Error {
  status: number
  details?: unknown
  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.details = details
  }
}

let refreshing: Promise<boolean> | null = null

async function refreshTokens(): Promise<boolean> {
  refreshing ??= (async () => {
    const refreshToken = getRefreshToken()
    if (!refreshToken) return false
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })
      if (!res.ok) return false
      const data = await res.json()
      setTokens(data.accessToken, data.refreshToken)
      return true
    } catch {
      return false
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

export async function api<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  retried = false,
): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'Cannot reach the NOUVII API — is the server running? (cd server && npm run dev)')
  }
  if (res.status === 401 && !retried && (await refreshTokens())) {
    return api(method, path, body, true)
  }
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.message ?? `Request failed (${res.status})`, data?.error?.details)
  }
  return data as T
}

/** Uploads bytes to a presigned target (local driver needs the auth header; S3 ignores it). */
export async function putBytes(uploadUrl: string, file: File, headers: Record<string, string>) {
  const url = uploadUrl.startsWith('/') ? `${apiOrigin}${uploadUrl}` : uploadUrl
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...headers, ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) },
    body: file,
  })
  if (!res.ok) throw new ApiError(res.status, 'Upload failed')
}

/** Server returns storage-relative URLs for the local driver; make them absolute. */
export const absoluteUrl = (u: string) => (u.startsWith('/') ? `${apiOrigin}${u}` : u)
