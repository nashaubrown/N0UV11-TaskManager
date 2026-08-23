import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { badRequest, notFound } from '../lib/errors.js'
import { requireAuth } from '../middleware/auth.js'
import { requireCapability } from '../lib/permissions.js'
import { validate } from '../middleware/validate.js'
import { param } from '../lib/params.js'
import { publicUrlFor } from '../services/storage.js'
import { sMerchant } from '../lib/serialize.js'
import { audit } from '../services/audit.js'
import { aiConfigured } from '../services/ai.js'

/* Instagram-style feed plan per merchant: an ordered set of APPROVED photos
 * (position 0 = top-left of the grid), each with an optional caption. */

export const feedRouter = Router()
feedRouter.use(requireAuth)

async function loadMerchant(orgId: string, id: string) {
  const m = await prisma.merchants.findFirst({ where: { id, organization_id: orgId } })
  if (!m) throw notFound('Merchant')
  return m
}

export async function feedItemsFor(merchantId: string) {
  const items = await prisma.feed_plan_items.findMany({
    where: { merchant_id: merchantId },
    include: { photos: true },
    orderBy: { position: 'asc' },
  })
  return items
    .filter((i) => !i.photos.deleted_at)
    .map((i) => ({
      photoId: i.photo_id,
      position: i.position,
      caption: i.caption ?? undefined,
      scheduledAt: i.scheduled_at?.toISOString(),
      title: i.photos.title ?? undefined,
      url: publicUrlFor(i.photos.s3_key),
      thumbUrl: publicUrlFor(i.photos.thumb_s3_key ?? i.photos.s3_key),
    }))
}

/** The connected Instagram account's real profile + published grid, for the
 *  feed preview. Null when the merchant has no Instagram connected. */
async function liveAccountFor(merchantId: string) {
  const account = await prisma.social_accounts.findFirst({ where: { merchant_id: merchantId } })
  if (!account) return null
  const posts = await prisma.social_posts.findMany({
    where: { account_id: account.id },
    orderBy: { posted_at: 'desc' },
    take: 33,
  })
  return {
    username: account.username ?? undefined,
    followers: account.followers ?? undefined,
    following: account.following ?? undefined,
    mediaCount: account.media_count ?? posts.length,
    avatarUrl: account.profile_picture_url ?? undefined,
    bio: account.biography ?? undefined,
    lastSyncedAt: account.last_synced_at ?? undefined,
    posts: posts
      .filter((p) => p.thumbnail_url)
      .map((p) => ({
        id: p.ig_media_id,
        thumbUrl: p.thumbnail_url!,
        permalink: p.permalink ?? undefined,
        postedAt: p.posted_at ?? undefined,
      })),
  }
}

/** GET /merchants/:id/feed */
feedRouter.get('/:id/feed', async (req, res) => {
  const merchant = await loadMerchant(req.auth!.organizationId, param(req, 'id'))
  res.json({
    merchant: sMerchant(merchant),
    items: await feedItemsFor(merchant.id),
    live: await liveAccountFor(merchant.id),
  })
})

/** POST /merchants/:id/feed — add an approved photo to the top of the plan. */
feedRouter.post('/:id/feed', requireCapability('feed.manage'), validate(z.object({ photoId: z.string().uuid() })), async (req, res) => {
  const merchant = await loadMerchant(req.auth!.organizationId, param(req, 'id'))
  const photo = await prisma.photos.findFirst({
    where: { id: req.body.photoId, organization_id: req.auth!.organizationId, deleted_at: null },
    include: { approval_requests: { orderBy: { created_at: 'desc' }, take: 1 } },
  })
  if (!photo) throw notFound('Photo')
  if (photo.approval_requests[0]?.status !== 'approved') {
    throw badRequest('Only approved photos can go on the feed plan')
  }
  await prisma.$transaction([
    prisma.feed_plan_items.updateMany({ where: { merchant_id: merchant.id }, data: { position: { increment: 1 } } }),
    prisma.feed_plan_items.create({
      data: { merchant_id: merchant.id, photo_id: photo.id, position: 0, added_by: req.auth!.userId },
    }),
  ])
  audit(req, 'feed.add', 'merchant', merchant.id, { photoId: photo.id })
  res.status(201).json({ items: await feedItemsFor(merchant.id) })
})

/** PATCH /merchants/:id/feed — reorder: body {order: [photoId, ...]} top-left first. */
feedRouter.patch('/:id/feed', requireCapability('feed.manage'), validate(z.object({ order: z.array(z.string().uuid()).max(200) })), async (req, res) => {
  const merchant = await loadMerchant(req.auth!.organizationId, param(req, 'id'))
  await prisma.$transaction(
    req.body.order.map((photoId: string, i: number) =>
      prisma.feed_plan_items.updateMany({
        where: { merchant_id: merchant.id, photo_id: photoId },
        data: { position: i },
      }),
    ),
  )
  audit(req, 'feed.reorder', 'merchant', merchant.id)
  res.json({ items: await feedItemsFor(merchant.id) })
})

/** PATCH /merchants/:id/feed/:photoId — edit the caption and/or planned slot. */
feedRouter.patch('/:id/feed/:photoId', requireCapability('feed.manage'), validate(z.object({
  caption: z.string().max(2200).optional(),
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
})), async (req, res) => {
  const merchant = await loadMerchant(req.auth!.organizationId, param(req, 'id'))
  const data: { caption?: string; scheduled_at?: Date | null } = {}
  if (req.body.caption !== undefined) data.caption = req.body.caption
  if (req.body.scheduledAt !== undefined) data.scheduled_at = req.body.scheduledAt ? new Date(req.body.scheduledAt) : null
  if (!Object.keys(data).length) throw badRequest('Nothing to update')
  const { count } = await prisma.feed_plan_items.updateMany({
    where: { merchant_id: merchant.id, photo_id: param(req, 'photoId') },
    data,
  })
  if (!count) throw notFound('Feed item')
  res.json({ ok: true })
})

/** DELETE /merchants/:id/feed/:photoId */
feedRouter.delete('/:id/feed/:photoId', requireCapability('feed.manage'), async (req, res) => {
  const merchant = await loadMerchant(req.auth!.organizationId, param(req, 'id'))
  await prisma.feed_plan_items.deleteMany({
    where: { merchant_id: merchant.id, photo_id: param(req, 'photoId') },
  })
  audit(req, 'feed.remove', 'merchant', merchant.id, { photoId: param(req, 'photoId') })
  res.status(204).end()
})

/** POST /merchants/:id/feed/:photoId/caption-ai — draft an IG caption from
 *  the photo's Claude Vision analysis (falls back to basic facts). */
feedRouter.post('/:id/feed/:photoId/caption-ai', requireCapability('feed.manage'), async (req, res) => {
  if (!aiConfigured) throw badRequest('AI captions need ANTHROPIC_API_KEY configured on the server')
  const merchant = await loadMerchant(req.auth!.organizationId, param(req, 'id'))
  const photo = await prisma.photos.findFirst({
    where: { id: param(req, 'photoId'), organization_id: req.auth!.organizationId },
    include: { photo_ai_metadata: true, photo_tags: { where: { NOT: { ai_status: 'rejected' } } } },
  })
  if (!photo) throw notFound('Photo')

  const meta = photo.photo_ai_metadata
  const facts = [
    meta?.raw_response && (meta.raw_response as { description?: string }).description,
    photo.title,
    photo.photo_tags.length && `tags: ${photo.photo_tags.map((t) => t.tag).join(', ')}`,
    meta?.classification && `type: ${meta.classification}`,
    merchant.location && `location: ${merchant.location}`,
  ].filter(Boolean).join('. ')

  const client = new Anthropic()
  const response = await client.messages.create({
    model: process.env.AI_MODEL ?? 'claude-opus-5',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `Write an Instagram caption for ${merchant.name}${merchant.ig_handle ? ` (@${merchant.ig_handle})` : ''}, a Maldivian business.
Photo facts: ${facts || 'a professional brand photo'}.
Style: warm, concise (1-2 short sentences), no emojis overload (max 2), end with 3-5 relevant hashtags on a new line. Reply with the caption only.`,
    }],
  })
  const text = response.content.find((b) => b.type === 'text')
  if (!text || text.type !== 'text') throw badRequest('AI returned no caption')
  const caption = text.text.trim()
  await prisma.feed_plan_items.updateMany({
    where: { merchant_id: merchant.id, photo_id: photo.id },
    data: { caption },
  })
  res.json({ caption })
})
