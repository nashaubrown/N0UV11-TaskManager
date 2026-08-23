import { api, DEMO } from './api'
import type { Photo } from '../types'

/* Instagram analytics data: real mode talks to /analytics/* (Meta Graph API
 * behind the server); demo mode generates realistic, deterministic sample
 * numbers per merchant so the page works before anything is connected. */

export interface AnalyticsSeriesPoint {
  day: string
  followers?: number
  reach?: number
  impressions?: number
  profileViews?: number
  websiteClicks?: number
}

export interface AnalyticsPost {
  id: string
  caption?: string
  mediaType?: string
  thumbUrl?: string
  permalink?: string
  postedAt?: string
  likes?: number
  comments?: number
  reach?: number
  saved?: number
}

export interface AnalyticsProviders {
  facebook: boolean
  instagram: boolean
}

export interface AnalyticsData {
  configured: boolean
  providers?: AnalyticsProviders
  account: { username?: string; connectedAt?: string; lastSyncedAt?: string } | null
  series: AnalyticsSeriesPoint[]
  posts: AnalyticsPost[]
  onlineTimes: { dow: number; hour: number; value: number }[]
  /** true when the numbers are generated demo data, not the real API */
  sample?: boolean
}

export interface AnalyticsStatus {
  configured: boolean
  providers?: AnalyticsProviders
  redirectUrl?: string
  igRedirectUrl?: string
  accounts: { merchantId: string; username?: string; connectedAt: string; lastSyncedAt?: string }[]
}

/* ---------- demo generation (deterministic per merchant) ---------- */

const hash = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

const mulberry32 = (seed: number) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export function demoAnalytics(merchantId: string, igHandle: string | undefined, photos: Photo[], days = 30): AnalyticsData {
  const rnd = mulberry32(hash(merchantId))
  const baseFollowers = 900 + Math.floor(rnd() * 14000)
  const dailyGrowth = 2 + rnd() * 18
  const engagement = 0.025 + rnd() * 0.045

  const series: AnalyticsSeriesPoint[] = []
  const today = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86_400_000)
    const dow = d.getDay()
    const weekend = dow === 5 || dow === 6 ? 1.25 : 1 // Fri/Sat lift (Maldives weekend)
    const followers = Math.round(baseFollowers + (days - 1 - i) * dailyGrowth + rnd() * 14)
    const reach = Math.round(followers * (0.22 + rnd() * 0.3) * weekend)
    series.push({
      day: d.toISOString().slice(0, 10),
      followers,
      reach,
      impressions: Math.round(reach * (1.3 + rnd() * 0.5)),
      profileViews: Math.round(reach * (0.06 + rnd() * 0.05)),
      websiteClicks: Math.round(reach * (0.012 + rnd() * 0.015)),
    })
  }

  const merchantPhotos = photos.filter((p) => p.merchantId === merchantId && p.status === 'ready')
  const posts: AnalyticsPost[] = merchantPhotos.slice(0, 12).map((p, i) => {
    const followers = series[series.length - 1].followers ?? baseFollowers
    const likes = Math.round(followers * engagement * (0.6 + rnd() * 0.9))
    return {
      id: `demo-${p.id}`,
      caption: p.title,
      mediaType: 'IMAGE',
      thumbUrl: p.thumbUrl,
      postedAt: new Date(today.getTime() - (i * 2.5 + 1) * 86_400_000).toISOString(),
      likes,
      comments: Math.round(likes * (0.04 + rnd() * 0.06)),
      reach: Math.round(likes / (engagement * 0.55)),
      saved: Math.round(likes * (0.08 + rnd() * 0.1)),
    }
  })

  // bimodal audience: lunch (12–14) and evening (19–22), Fri/Sat lift
  const onlineTimes: { dow: number; hour: number; value: number }[] = []
  for (let dow = 0; dow < 7; dow++) {
    for (let hour = 0; hour < 24; hour++) {
      const lunch = Math.exp(-((hour - 13) ** 2) / 4)
      const evening = Math.exp(-((hour - 20.5) ** 2) / 5.5)
      const weekend = dow === 5 || dow === 6 ? 1.3 : 1
      const value = (lunch * 0.7 + evening) * weekend * (0.85 + rnd() * 0.3)
      onlineTimes.push({ dow, hour, value: Math.round(value * 100) / 100 })
    }
  }

  return {
    configured: true,
    account: { username: igHandle ?? 'sample_account', lastSyncedAt: today.toISOString() },
    series,
    posts,
    onlineTimes,
    sample: true,
  }
}

/* ---------- API access ---------- */

export const fetchAnalyticsStatus = () =>
  DEMO ? Promise.resolve<AnalyticsStatus>({ configured: true, accounts: [] }) : api<AnalyticsStatus>('GET', '/analytics/status')

export const fetchAnalytics = (merchantId: string, days: number) =>
  api<AnalyticsData>('GET', `/analytics/${merchantId}?days=${days}`)

export const startConnect = (merchantId: string, provider: 'instagram' | 'facebook') =>
  api<{ url: string }>('POST', `/analytics/${merchantId}/connect`, { provider })

export const syncNow = (merchantId: string) => api('POST', `/analytics/${merchantId}/sync`)

export const disconnect = (merchantId: string) => api('DELETE', `/analytics/${merchantId}`)
