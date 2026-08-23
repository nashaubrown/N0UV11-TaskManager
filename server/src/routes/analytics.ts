import { Router, type Response } from 'express'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { config } from '../lib/config.js'
import { badRequest, notFound } from '../lib/errors.js'
import { param } from '../lib/params.js'
import { requireAuth } from '../middleware/auth.js'
import { requireCapability } from '../lib/permissions.js'
import { audit } from '../services/audit.js'
import { oauthUrl, exchangeCode, findIgAccount, igOauthUrl, exchangeIgCode, enqueueSync, syncAccount } from '../services/meta.js'

/* Metricool-style Instagram analytics. Connections are per merchant; viewing
 * is open to any signed-in member, connect/disconnect/sync needs
 * merchants.manage. The OAuth callback is public (Facebook redirects the
 * browser there) and is validated by the signed state token. */

export const analyticsRouter = Router()

const stateFor = (orgId: string, merchantId: string, userId: string) =>
  jwt.sign({ org: orgId, merchant: merchantId, user: userId, purpose: 'ig-connect' }, config.jwt.secret, { expiresIn: '15m' })

type ConnectClaims = { org: string; merchant: string; user: string; purpose: string }

const verifyState = (state: unknown): ConnectClaims | null => {
  try {
    const claims = jwt.verify(typeof state === 'string' ? state : '', config.jwt.secret) as ConnectClaims
    return claims.purpose === 'ig-connect' ? claims : null
  } catch {
    return null
  }
}

const backTo = (res: Response, merchantId: string | undefined, q: string) =>
  res.redirect(`${config.webOrigin}/analytics${merchantId ? `?merchant=${merchantId}&` : '?'}${q}`)

/** GET /analytics/oauth/callback — Facebook (Page flow) redirects here. PUBLIC. */
analyticsRouter.get('/oauth/callback', async (req, res) => {
  const claims = verifyState(req.query.state)
  if (!claims) {
    return backTo(res, undefined, 'ig=error&reason=' + encodeURIComponent('The connect link expired — try again from the Analytics page.'))
  }
  if (typeof req.query.code !== 'string') {
    return backTo(res, claims.merchant, 'ig=error&reason=' + encodeURIComponent(String(req.query.error_description ?? 'Facebook did not authorize the connection.')))
  }
  try {
    const userToken = await exchangeCode(req.query.code)
    const ig = await findIgAccount(userToken)
    const account = await prisma.social_accounts.upsert({
      where: { merchant_id_platform: { merchant_id: claims.merchant, platform: 'instagram' } },
      create: {
        organization_id: claims.org,
        merchant_id: claims.merchant,
        platform: 'instagram',
        auth_kind: 'facebook',
        ig_user_id: ig.igUserId,
        username: ig.username,
        access_token: ig.pageToken,
        connected_by: claims.user,
      },
      update: { auth_kind: 'facebook', ig_user_id: ig.igUserId, username: ig.username, access_token: ig.pageToken, token_expires_at: null, connected_at: new Date() },
    })
    enqueueSync(account.id)
    return backTo(res, claims.merchant, 'ig=connected')
  } catch (err) {
    return backTo(res, claims.merchant, 'ig=error&reason=' + encodeURIComponent(err instanceof Error ? err.message : 'Connection failed'))
  }
})

/** GET /analytics/oauth/instagram/callback — Instagram login (no Page) redirects here. PUBLIC. */
analyticsRouter.get('/oauth/instagram/callback', async (req, res) => {
  const claims = verifyState(req.query.state)
  if (!claims) {
    return backTo(res, undefined, 'ig=error&reason=' + encodeURIComponent('The connect link expired — try again from the Analytics page.'))
  }
  if (typeof req.query.code !== 'string') {
    return backTo(res, claims.merchant, 'ig=error&reason=' + encodeURIComponent(String(req.query.error_description ?? req.query.error_reason ?? 'Instagram did not authorize the connection.')))
  }
  try {
    const ig = await exchangeIgCode(req.query.code)
    const account = await prisma.social_accounts.upsert({
      where: { merchant_id_platform: { merchant_id: claims.merchant, platform: 'instagram' } },
      create: {
        organization_id: claims.org,
        merchant_id: claims.merchant,
        platform: 'instagram',
        auth_kind: 'instagram',
        ig_user_id: ig.igUserId,
        username: ig.username,
        access_token: ig.token,
        token_expires_at: ig.expiresAt,
        connected_by: claims.user,
      },
      update: {
        auth_kind: 'instagram',
        ig_user_id: ig.igUserId,
        username: ig.username,
        access_token: ig.token,
        token_expires_at: ig.expiresAt,
        connected_at: new Date(),
      },
    })
    enqueueSync(account.id)
    return backTo(res, claims.merchant, 'ig=connected')
  } catch (err) {
    return backTo(res, claims.merchant, 'ig=error&reason=' + encodeURIComponent(err instanceof Error ? err.message : 'Connection failed'))
  }
})

analyticsRouter.use(requireAuth)

/** GET /analytics/status — is the Meta app configured, and what's connected. */
analyticsRouter.get('/status', async (req, res) => {
  const accounts = await prisma.social_accounts.findMany({
    where: { organization_id: req.auth!.organizationId },
    orderBy: { connected_at: 'desc' },
  })
  res.json({
    configured: config.meta.configured || config.meta.igConfigured,
    providers: { facebook: config.meta.configured, instagram: config.meta.igConfigured },
    redirectUrl: config.meta.redirectUrl,
    igRedirectUrl: config.meta.igRedirectUrl,
    accounts: accounts.map((a) => ({
      merchantId: a.merchant_id,
      username: a.username ?? undefined,
      connectedAt: a.connected_at,
      lastSyncedAt: a.last_synced_at ?? undefined,
    })),
  })
})

async function loadMerchant(orgId: string, id: string) {
  const m = await prisma.merchants.findFirst({ where: { id, organization_id: orgId } })
  if (!m) throw notFound('Merchant')
  return m
}

/** POST /analytics/:merchantId/connect — start an OAuth dialog.
 *  body.provider: 'instagram' (IG login, no Page — default when configured)
 *  or 'facebook' (Page-linked flow). */
analyticsRouter.post('/:merchantId/connect', requireCapability('merchants.manage'), async (req, res) => {
  const requested = req.body?.provider
  const provider: 'instagram' | 'facebook' =
    requested === 'facebook' || requested === 'instagram'
      ? requested
      : config.meta.igConfigured ? 'instagram' : 'facebook'
  if (provider === 'instagram' && !config.meta.igConfigured) {
    throw badRequest('Instagram login needs IG_APP_ID and IG_APP_SECRET configured on the server')
  }
  if (provider === 'facebook' && !config.meta.configured) {
    throw badRequest('The Facebook flow needs META_APP_ID and META_APP_SECRET configured on the server')
  }
  const merchant = await loadMerchant(req.auth!.organizationId, param(req, 'merchantId'))
  const state = stateFor(req.auth!.organizationId, merchant.id, req.auth!.userId)
  res.json({ url: provider === 'instagram' ? igOauthUrl(state) : oauthUrl(state) })
})

/** POST /analytics/:merchantId/sync — pull fresh numbers now. */
analyticsRouter.post('/:merchantId/sync', requireCapability('merchants.manage'), async (req, res) => {
  const merchant = await loadMerchant(req.auth!.organizationId, param(req, 'merchantId'))
  const account = await prisma.social_accounts.findFirst({ where: { merchant_id: merchant.id } })
  if (!account) throw notFound('Instagram connection')
  await syncAccount(account.id)
  audit(req, 'analytics.sync', 'merchant', merchant.id)
  res.json({ ok: true, lastSyncedAt: new Date() })
})

/** DELETE /analytics/:merchantId — disconnect Instagram. */
analyticsRouter.delete('/:merchantId', requireCapability('merchants.manage'), async (req, res) => {
  const merchant = await loadMerchant(req.auth!.organizationId, param(req, 'merchantId'))
  await prisma.social_accounts.deleteMany({ where: { merchant_id: merchant.id, organization_id: req.auth!.organizationId } })
  audit(req, 'analytics.disconnect', 'merchant', merchant.id)
  res.status(204).end()
})

const daysDto = z.coerce.number().int().min(7).max(90).default(30)

/** GET /analytics/:merchantId?days=30 — everything the dashboard needs. */
analyticsRouter.get('/:merchantId', async (req, res) => {
  const merchant = await loadMerchant(req.auth!.organizationId, param(req, 'merchantId'))
  const days = daysDto.parse(req.query.days ?? 30)
  const account = await prisma.social_accounts.findFirst({ where: { merchant_id: merchant.id } })
  if (!account) {
    return res.json({
      configured: config.meta.configured || config.meta.igConfigured,
      providers: { facebook: config.meta.configured, instagram: config.meta.igConfigured },
      account: null, series: [], posts: [], onlineTimes: [],
    })
  }

  // refresh in the background when numbers are stale (>6h)
  if (!account.last_synced_at || Date.now() - account.last_synced_at.getTime() > 6 * 3_600_000) {
    enqueueSync(account.id)
  }

  const since = new Date(Date.now() - days * 86_400_000)
  const [series, posts, online] = await Promise.all([
    prisma.social_metrics_daily.findMany({
      where: { account_id: account.id, day: { gte: since } },
      orderBy: { day: 'asc' },
    }),
    prisma.social_posts.findMany({
      where: { account_id: account.id, is_tagged: false },
      orderBy: { posted_at: 'desc' },
      take: 30,
    }),
    prisma.social_online_times.findMany({ where: { account_id: account.id } }),
  ])

  res.json({
    configured: config.meta.configured || config.meta.igConfigured,
    providers: { facebook: config.meta.configured, instagram: config.meta.igConfigured },
    account: {
      username: account.username ?? undefined,
      connectedAt: account.connected_at,
      lastSyncedAt: account.last_synced_at ?? undefined,
    },
    series: series.map((s) => ({
      day: s.day.toISOString().slice(0, 10),
      followers: s.followers ?? undefined,
      reach: s.reach ?? undefined,
      impressions: s.impressions ?? undefined,
      profileViews: s.profile_views ?? undefined,
      websiteClicks: s.website_clicks ?? undefined,
    })),
    posts: posts.map((p) => ({
      id: p.ig_media_id,
      caption: p.caption ?? undefined,
      mediaType: p.media_type ?? undefined,
      thumbUrl: p.thumbnail_url ?? undefined,
      permalink: p.permalink ?? undefined,
      postedAt: p.posted_at ?? undefined,
      likes: p.like_count ?? undefined,
      comments: p.comments_count ?? undefined,
      reach: p.reach ?? undefined,
      saved: p.saved ?? undefined,
    })),
    onlineTimes: online.map((o) => ({ dow: o.dow, hour: o.hour, value: o.value })),
  })
})
