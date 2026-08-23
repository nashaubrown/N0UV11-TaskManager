import { config } from '../lib/config.js'
import { prisma } from '../lib/prisma.js'

/* Instagram analytics via the Meta Graph API — two connect paths:
 *
 * 1. Facebook login (auth_kind 'facebook'): the IG business account must be
 *    linked to a Facebook Page; we store the Page token (never expires).
 * 2. Instagram login (auth_kind 'instagram'): the merchant signs in with
 *    just their Instagram — no Page needed. Tokens are 60-day long-lived
 *    and refreshed automatically during syncs.
 *
 * Syncs pull profile counts, daily insights, media performance and
 * audience-online times into the social_* tables, hitting
 * graph.facebook.com or graph.instagram.com depending on auth_kind.
 *
 * Inert unless META_APP_ID/META_APP_SECRET (Facebook path) and/or
 * IG_APP_ID/IG_APP_SECRET (Instagram path) are set. */

const GRAPH = 'https://graph.facebook.com/v21.0'
const IG_GRAPH = 'https://graph.instagram.com/v21.0'
const OAUTH_DIALOG = 'https://www.facebook.com/v21.0/dialog/oauth'
const IG_OAUTH_DIALOG = 'https://www.instagram.com/oauth/authorize'
const SCOPES = ['instagram_basic', 'instagram_manage_insights', 'pages_show_list', 'pages_read_engagement', 'business_management']
const IG_SCOPES = ['instagram_business_basic', 'instagram_business_manage_insights']

async function graph<T>(path: string, params: Record<string, string>, host = GRAPH): Promise<T> {
  const url = new URL(`${host}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url)
  const body = (await res.json()) as T & { error?: { message: string; code: number } }
  if (!res.ok || body.error) {
    throw new Error(`Meta API ${path}: ${body.error?.message ?? res.statusText}`)
  }
  return body
}

export function oauthUrl(state: string): string {
  const url = new URL(OAUTH_DIALOG)
  url.searchParams.set('client_id', config.meta.appId)
  url.searchParams.set('redirect_uri', config.meta.redirectUrl)
  url.searchParams.set('state', state)
  url.searchParams.set('scope', SCOPES.join(','))
  url.searchParams.set('response_type', 'code')
  return url.toString()
}

/** OAuth code → long-lived user access token. */
export async function exchangeCode(code: string): Promise<string> {
  const short = await graph<{ access_token: string }>('/oauth/access_token', {
    client_id: config.meta.appId,
    client_secret: config.meta.appSecret,
    redirect_uri: config.meta.redirectUrl,
    code,
  })
  const long = await graph<{ access_token: string }>('/oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: config.meta.appId,
    client_secret: config.meta.appSecret,
    fb_exchange_token: short.access_token,
  })
  return long.access_token
}

/* ---------- Instagram login (no Facebook Page) ---------- */

export function igOauthUrl(state: string): string {
  const url = new URL(IG_OAUTH_DIALOG)
  url.searchParams.set('client_id', config.meta.igAppId)
  url.searchParams.set('redirect_uri', config.meta.igRedirectUrl)
  url.searchParams.set('state', state)
  url.searchParams.set('scope', IG_SCOPES.join(','))
  url.searchParams.set('response_type', 'code')
  return url.toString()
}

export interface IgLoginResult { igUserId: string; username?: string; token: string; expiresAt: Date }

/** Instagram-login OAuth code → long-lived (60-day) token + profile. */
export async function exchangeIgCode(code: string): Promise<IgLoginResult> {
  const form = new URLSearchParams({
    client_id: config.meta.igAppId,
    client_secret: config.meta.igAppSecret,
    grant_type: 'authorization_code',
    redirect_uri: config.meta.igRedirectUrl,
    code,
  })
  const res = await fetch('https://api.instagram.com/oauth/access_token', { method: 'POST', body: form })
  const short = (await res.json()) as { access_token?: string; user_id?: string | number; error_message?: string; error?: { message?: string } }
  if (!res.ok || !short.access_token) {
    throw new Error(`Instagram login failed: ${short.error_message ?? short.error?.message ?? res.statusText}`)
  }
  const long = await graph<{ access_token: string; expires_in: number }>('/access_token', {
    grant_type: 'ig_exchange_token',
    client_secret: config.meta.igAppSecret,
    access_token: short.access_token,
  }, 'https://graph.instagram.com')
  const me = await graph<{ user_id?: string | number; id?: string; username?: string }>('/me', {
    fields: 'user_id,username',
    access_token: long.access_token,
  }, IG_GRAPH)
  return {
    igUserId: String(me.user_id ?? me.id ?? short.user_id),
    username: me.username,
    token: long.access_token,
    expiresAt: new Date(Date.now() + long.expires_in * 1000),
  }
}

/** Instagram-login tokens last 60 days — refresh when within 10 days of
 *  expiry. Returns the current (possibly new) token. */
async function freshIgToken(account: { id: string; access_token: string; token_expires_at: Date | null }): Promise<string> {
  const expiring = account.token_expires_at && account.token_expires_at.getTime() - Date.now() < 10 * 86_400_000
  if (!expiring) return account.access_token
  try {
    const renewed = await graph<{ access_token: string; expires_in: number }>('/refresh_access_token', {
      grant_type: 'ig_refresh_token',
      access_token: account.access_token,
    }, 'https://graph.instagram.com')
    await prisma.social_accounts.update({
      where: { id: account.id },
      data: { access_token: renewed.access_token, token_expires_at: new Date(Date.now() + renewed.expires_in * 1000) },
    })
    return renewed.access_token
  } catch {
    return account.access_token // refresh failed — keep trying with the old one until it dies
  }
}

/* ---------- Facebook login (Page-linked accounts) ---------- */

export interface IgAccount { igUserId: string; username?: string; pageToken: string }

/** Find the first Facebook Page (managed by this user) with a linked
 *  Instagram business account, and its Page token. */
export async function findIgAccount(userToken: string): Promise<IgAccount> {
  const pages = await graph<{ data: { id: string; access_token: string; instagram_business_account?: { id: string; username?: string } }[] }>(
    '/me/accounts',
    { fields: 'id,name,access_token,instagram_business_account{id,username}', access_token: userToken, limit: '50' },
  )
  const page = pages.data.find((p) => p.instagram_business_account)
  if (!page) {
    throw new Error('No Instagram business account found. Link the merchant’s Instagram (professional account) to a Facebook Page you manage, then try again.')
  }
  return { igUserId: page.instagram_business_account!.id, username: page.instagram_business_account!.username, pageToken: page.access_token }
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10)

/** Pull one metric series, tolerating per-metric API refusals (metrics come
 *  and go across Graph API versions and account types). */
async function insightSeries(igUserId: string, token: string, metric: string, sinceDays: number, host: string): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  try {
    const since = Math.floor((Date.now() - sinceDays * 86_400_000) / 1000)
    const body = await graph<{ data: { name: string; values: { value: number; end_time: string }[] }[] }>(
      `/${igUserId}/insights`,
      { metric, period: 'day', since: String(since), until: String(Math.floor(Date.now() / 1000)), access_token: token },
      host,
    )
    for (const v of body.data[0]?.values ?? []) out.set(v.end_time.slice(0, 10), v.value)
  } catch {
    /* metric unavailable for this account/version — leave the column null */
  }
  return out
}

/** Full sync for one connected account: profile, daily series, media, online times. */
export async function syncAccount(accountId: string): Promise<void> {
  const account = await prisma.social_accounts.findUnique({ where: { id: accountId } })
  if (!account) return
  const viaIgLogin = account.auth_kind === 'instagram'
  const host = viaIgLogin ? IG_GRAPH : GRAPH
  const token = viaIgLogin ? await freshIgToken(account) : account.access_token
  const ig = account.ig_user_id

  const profile = await graph<{ followers_count?: number; follows_count?: number; media_count?: number; username?: string }>(
    viaIgLogin ? '/me' : `/${ig}`,
    { fields: 'followers_count,follows_count,media_count,username', access_token: token },
    host,
  )

  const [reach, impressions, profileViews, websiteClicks] = await Promise.all([
    insightSeries(ig, token, 'reach', 30, host),
    insightSeries(ig, token, 'impressions', 30, host),
    insightSeries(ig, token, 'profile_views', 30, host),
    insightSeries(ig, token, 'website_clicks', 30, host),
  ])

  const days = new Set<string>([...reach.keys(), ...impressions.keys(), ...profileViews.keys(), dayKey(new Date())])
  for (const day of days) {
    const data = {
      followers: profile.followers_count ?? null,
      media_count: profile.media_count ?? null,
      reach: reach.get(day) ?? null,
      impressions: impressions.get(day) ?? null,
      profile_views: profileViews.get(day) ?? null,
      website_clicks: websiteClicks.get(day) ?? null,
    }
    await prisma.social_metrics_daily.upsert({
      where: { account_id_day: { account_id: account.id, day: new Date(day) } },
      create: { account_id: account.id, day: new Date(day), ...data },
      update: data,
    })
  }

  // media + per-post performance
  try {
    const media = await graph<{ data: { id: string; caption?: string; media_type?: string; media_url?: string; thumbnail_url?: string; permalink?: string; timestamp?: string; like_count?: number; comments_count?: number }[] }>(
      viaIgLogin ? '/me/media' : `/${ig}/media`,
      { fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count', limit: '30', access_token: token },
      host,
    )
    for (const m of media.data) {
      let postReach: number | null = null
      let saved: number | null = null
      try {
        const ins = await graph<{ data: { name: string; values: { value: number }[] }[] }>(
          `/${m.id}/insights`,
          { metric: 'reach,saved', access_token: token },
          host,
        )
        for (const row of ins.data) {
          if (row.name === 'reach') postReach = row.values[0]?.value ?? null
          if (row.name === 'saved') saved = row.values[0]?.value ?? null
        }
      } catch { /* stories/older media refuse insights — counts still useful */ }
      const data = {
        caption: m.caption ?? null,
        media_type: m.media_type ?? null,
        thumbnail_url: m.thumbnail_url ?? m.media_url ?? null,
        permalink: m.permalink ?? null,
        posted_at: m.timestamp ? new Date(m.timestamp) : null,
        like_count: m.like_count ?? null,
        comments_count: m.comments_count ?? null,
        reach: postReach,
        saved,
        last_synced_at: new Date(),
      }
      await prisma.social_posts.upsert({
        where: { account_id_ig_media_id: { account_id: account.id, ig_media_id: m.id } },
        create: { account_id: account.id, ig_media_id: m.id, ...data },
        update: data,
      })
    }
  } catch { /* media listing can fail on brand-new accounts */ }

  // audience online times → dow × hour heatmap
  try {
    const since = Math.floor((Date.now() - 14 * 86_400_000) / 1000)
    const body = await graph<{ data: { values: { value: Record<string, number>; end_time: string }[] }[] }>(
      `/${ig}/insights`,
      { metric: 'online_followers', period: 'lifetime', since: String(since), access_token: token },
      host,
    )
    const sums = new Map<string, { total: number; n: number }>()
    for (const day of body.data[0]?.values ?? []) {
      const dow = new Date(day.end_time).getUTCDay()
      for (const [hour, value] of Object.entries(day.value ?? {})) {
        const key = `${dow}:${hour}`
        const cur = sums.get(key) ?? { total: 0, n: 0 }
        sums.set(key, { total: cur.total + value, n: cur.n + 1 })
      }
    }
    for (const [key, { total, n }] of sums) {
      const [dow, hour] = key.split(':').map(Number)
      await prisma.social_online_times.upsert({
        where: { account_id_dow_hour: { account_id: account.id, dow, hour } },
        create: { account_id: account.id, dow, hour, value: total / n },
        update: { value: total / n },
      })
    }
  } catch { /* online_followers needs 100+ followers — fine to skip */ }

  await prisma.social_accounts.update({
    where: { id: account.id },
    data: {
      username: profile.username ?? account.username,
      followers: profile.followers_count ?? account.followers,
      following: profile.follows_count ?? account.following,
      media_count: profile.media_count ?? account.media_count,
      last_synced_at: new Date(),
    },
  })
}

/** Fire-and-forget sync with basic serialization per process. */
let syncChain: Promise<void> = Promise.resolve()
export function enqueueSync(accountId: string): void {
  syncChain = syncChain
    .then(() => syncAccount(accountId))
    .catch((err) => console.error(`[meta] sync failed for ${accountId}:`, err instanceof Error ? err.message : err))
}
